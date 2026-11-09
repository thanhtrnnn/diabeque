# Một image cho cả hai API; chọn thư mục ứng dụng bằng build arg APP (chap5-rag | chap6-agents).
FROM python:3.11-slim

ARG APP
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 HF_HOME=/hf

# torch bản CPU để image nhẹ hơn bản CUDA mặc định trên linux/amd64.
COPY chap6-agents/requirements.txt requirements.txt
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

COPY ${APP}/backend backend
COPY ${APP}/models models

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT"]
