"""
codtex 后端服务 - GLM OCR 公式识别
使用 Transformers 本地推理
"""

import os
import base64
import io
import tempfile
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

app = FastAPI(title="codtex API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None
processor = None


def load_model():
    global model, processor
    if model is not None:
        return model, processor

    import torch
    from transformers import AutoModel, AutoProcessor

    model_dir = Path(__file__).parent / "glm-ocr-model"
    print(f"加载 GLM OCR 模型: {model_dir}")

    processor = AutoProcessor.from_pretrained(model_dir, trust_remote_code=True)
    model = AutoModel.from_pretrained(
        model_dir,
        trust_remote_code=True,
        torch_dtype=torch.bfloat16,
    )
    model.eval()
    print("模型加载完成")
    return model, processor


class RecognizeRequest(BaseModel):
    image: str


class RecognizeResponse(BaseModel):
    success: bool
    latex: str = ""
    error: str = ""


@app.post("/recognize", response_model=RecognizeResponse)
async def recognize(request: RecognizeRequest):
    try:
        model, processor = load_model()

        import torch

        image_data = base64.b64decode(request.image)
        image = Image.open(io.BytesIO(image_data))

        prompt = "<|image|>请识别图片中的数学公式，返回LaTeX格式。只返回LaTeX代码，不要解释。"
        inputs = processor(images=image, text=prompt, return_tensors="pt")

        with torch.no_grad():
            # 获取图片特征
            pixel_values = inputs["pixel_values"]
            image_grid_thw = inputs["image_grid_thw"]

            # 编码图片
            image_features = model.get_image_features(
                pixel_values=pixel_values,
                image_grid_thw=image_grid_thw,
            )

            # 获取文本输入
            input_ids = inputs["input_ids"]
            attention_mask = inputs["attention_mask"]

            # 找到 image token 的位置，替换为图片特征
            # 使用模型的 forward 进行自回归生成
            # 由于模型没有 generate 方法，我们手动实现

            # 先尝试用 language_model 的 generate
            lm = model.language_model

            # 构造 decoder 输入：把 image token 替换为 image features
            # 获取 image token id
            image_token_id = processor.tokenizer.convert_tokens_to_ids("<|image|>")

            # 找到 input_ids 中 image token 的位置
            image_mask = (input_ids == image_token_id)

            # 获取文本 embedding
            inputs_embeds = lm.get_input_embeddings()(input_ids)

            # 将 image features 放入对应位置
            # image_features: [num_image_tokens, hidden_size]
            # image_mask: [1, seq_len]
            # 需要把 image_features 扩展到和 inputs_embeds 相同的 hidden_size
            hidden_size = inputs_embeds.shape[-1]
            if image_features.last_hidden_state.shape[-1] != hidden_size:
                # 需要投影
                image_features_hidden = model.get_image_features(
                    pixel_values=pixel_values,
                    image_grid_thw=image_grid_thw,
                ).last_hidden_state
            else:
                image_features_hidden = image_features.last_hidden_state

            # 替换 image token 位置的特征
            # image_features_hidden: [num_patches, hidden_size]
            # 需要按顺序填充到 image_mask 的位置
            image_positions = image_mask.nonzero(as_tuple=False)
            num_image_tokens = image_positions.shape[0]

            if num_image_tokens > 0:
                # 确保维度匹配
                for i in range(min(num_image_tokens, image_features_hidden.shape[0])):
                    batch_idx = image_positions[i, 0].item()
                    seq_idx = image_positions[i, 1].item()
                    inputs_embeds[batch_idx, seq_idx] = image_features_hidden[i]

            # 自回归生成
            generated_ids = input_ids.clone()
            max_new_tokens = 512

            for _ in range(max_new_tokens):
                # 前向传播
                outputs = lm(
                    inputs_embeds=inputs_embeds,
                    attention_mask=attention_mask,
                    output_hidden_states=False,
                    return_dict=True,
                )

                # 获取最后一个 token 的 hidden state，用 lm_head 投影
                last_hidden = outputs.last_hidden_state[:, -1, :]
                next_token_logits = model.lm_head(last_hidden)

                # 贪心解码
                next_token = next_token_logits.argmax(dim=-1, keepdim=True)

                # 检查是否生成结束符
                if next_token.item() == processor.tokenizer.eos_token_id:
                    break

                # 追加到生成序列
                generated_ids = torch.cat([generated_ids, next_token], dim=-1)

                # 更新 inputs_embeds 和 attention_mask
                next_embed = lm.get_input_embeddings()(next_token)
                inputs_embeds = torch.cat([inputs_embeds, next_embed], dim=1)

                # 更新 attention mask
                new_mask = torch.ones_like(next_token)
                attention_mask = torch.cat([attention_mask, new_mask], dim=1)

            # 解码生成的 token
            # 只取新生成的部分（去掉原始 input_ids）
            new_ids = generated_ids[:, input_ids.shape[1]:]
            latex = processor.tokenizer.decode(new_ids[0], skip_special_tokens=True)

        return RecognizeResponse(success=True, latex=latex)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return RecognizeResponse(success=False, error=str(e))


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": model is not None}


if __name__ == "__main__":
    import uvicorn
    print(f"服务启动: http://localhost:8765")
    uvicorn.run(app, host="127.0.0.1", port=8765)
