#!/bin/bash
# ============================================
# Pixel 部署脚本 - 阿里云自托管 Supabase
# ============================================

set -e

echo "============================================"
echo "Pixel 项目部署脚本"
echo "============================================"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}请使用 sudo 运行此脚本${NC}"
  exit 1
fi

echo -e "${GREEN}[1/8] 检查 Docker 安装...${NC}"
if ! command -v docker &> /dev/null; then
  echo "安装 Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "Docker 已安装"
fi

echo -e "${GREEN}[2/8] 检查 Docker Compose...${NC}"
if ! command -v docker-compose &> /dev/null; then
  echo "安装 Docker Compose v2..."
  curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
else
  echo "Docker Compose 已安装"
fi

echo -e "${GREEN}[3/8] 创建项目目录...${NC}"
mkdir -p /opt/pixel
cd /opt/pixel

echo -e "${GREEN}[4/8] 上传项目文件...${NC}"
# 如果使用 git clone
# git clone https://github.com/leoxool/pixelPainting.git .

echo -e "${GREEN}[5/8] 配置环境变量...${NC}"
if [ ! -f .env ]; then
  cat > .env << 'EOF'
POSTGRES_PASSWORD=kup3UPoi8Sh3Fh+lpFFuMF1ZmEYQVGQlZIENKoBJ+14=
JWT_SECRET=Bza1hnla/9FZfbFFwPISyjQY3pNxn9GUC9QesOSrAwM=
SUPABASE_ANON_KEY=HEA1guMw8cJqd7BAAe9PXbRGizELNDBJ/+RHyrHtxGI=
SUPABASE_SERVICE_ROLE_KEY=jIFyrGPv4VgHjevJQ8bOIRxu7Oo+3oq8U5oD95T+iOw=
EOF
  echo ".env 文件已创建"
else
  echo ".env 文件已存在"
fi

echo -e "${GREEN}[6/8] 启动服务...${NC}"
docker-compose down -v 2>/dev/null || true
docker-compose up -d

echo -e "${GREEN}[7/8] 等待服务启动...${NC}"
sleep 30

echo -e "${GREEN}[8/8] 检查服务状态...${NC}"
docker-compose ps

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}部署完成！${NC}"
echo -e "============================================"
echo ""
echo "服务地址 (自托管环境):"
echo "  - 应用:     http://112.124.48.49:3002"
echo "  - Supabase: http://112.124.48.49:8001"
echo "  - Studio:   http://112.124.48.49:3003"
echo ""
echo "端口分配:"
echo "  - Next.js:     3002 (主机) -> 3000 (容器)"
echo "  - Kong:        8001 (主机) -> 8000 (容器)"
echo "  - PostgreSQL:  5433 (主机) -> 5432 (容器)"
echo "  - Studio:      3003 (主机) -> 3000 (容器)"
echo "  - Meta:        8081 (主机) -> 8080 (容器)"
echo "  - Realtime:    6545 (主机) -> 6544 (容器)"
echo "  - Storage:     5001 (主机) -> 5000 (容器)"
echo "  - GoTrue:      9001 (主机) -> 9999 (容器)"
echo ""
echo "查看日志: docker-compose logs -f"
echo "停止服务: docker-compose down"
echo "============================================"