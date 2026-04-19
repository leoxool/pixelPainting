# 部署到阿里云服务器 (自托管 Supabase)

## 架构说明

```
【自托管架构 - 完全内网】
用户设备 → 阿里云 (Next.js + Supabase + PostgreSQL + Realtime)
                         ↓
              所有服务内网运行，不依赖外部网络
```

## 前置条件

- 阿里云服务器 (Alibaba Cloud Linux 3 / RHEL)
- SSH 访问权限
- 服务器已开放必要端口: 3000, 3001, 5432, 8000, 8080, 5000, 6544

---

## 部署步骤

### 1. 服务器环境准备

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 安装 Docker Compose v2
curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

### 2. 上传项目文件

```bash
mkdir -p /opt/pixel && cd /opt/pixel
git clone https://github.com/leoxool/pixelPainting.git .
```

### 3. 配置环境变量

```bash
cd /opt/pixel

# 复制环境变量模板
cp .env.example .env

# 生成安全的密钥
openssl rand -base64 32

# 编辑 .env 文件，填入以下值:
# POSTGRES_PASSWORD=your_secure_postgres_password_here
# JWT_SECRET=your_32_character_minimum_jwt_secret_here
# SUPABASE_ANON_KEY=your_anon_key_here
# SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**关于 ANON_KEY 和 SERVICE_ROLE_KEY:**
- 可以从 supabase.co 项目的设置 > API 导出现有密钥
- 或使用 `openssl rand -base64 32` 生成新密钥
- 注意: 这两个密钥需要与 Next.js 配置中的匹配

### 4. 启动所有服务

```bash
cd /opt/pixel
docker-compose up -d
```

### 5. 初始化数据库

首次启动后，需要在 Supabase Studio 中执行数据库 migrations。

访问 `http://你的服务器IP:3001` 打开 Supabase Studio，然后：
1. 进入 SQL Editor
2. 执行以下命令启用必要扩展:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
ALTER DATABASE postgres SET "app.settings.jwt_secret" TO 'your_jwt_secret_here';
```

### 6. 验证部署

```bash
# 检查所有容器状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 测试 API
curl http://localhost:8000/rest/v1/
```

---

## 服务端口说明

| 服务 | 端口 | 说明 |
|------|------|------|
| Next.js | 3000 | 主应用 |
| Kong (API Gateway) | 8000 | Supabase API 统一入口 |
| Supabase Studio | 3001 | Web 管理界面 |
| PostgreSQL | 5432 | 数据库 |
| GoTrue (Auth) | 9999 | 认证服务 (内部) |
| PostgREST | 3000 | SQL API (内部) |
| Storage API | 5000 | 文件存储 (内部) |
| Realtime | 6544 | WebSocket (内部) |
| Postgres Meta | 8080 | 元数据服务 (内部) |

---

## 配置 Auth 重定向 URL

在 Supabase Studio > Authentication > URL Configuration 设置:
- Site URL: `http://你的域名`
- Redirect URLs: `http://你的域名/**`

---

## Nginx 反向代理 (可选)

如果需要域名访问:

```bash
yum install -y nginx
cp deploy/nginx.conf.example /etc/nginx/conf.d/pixel.conf
# 编辑 /etc/nginx/conf.d/pixel.conf，替换 your-domain.com
nginx -t && systemctl enable --now nginx
```

### SSL 配置 (Let's Encrypt)

```bash
yum install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

---

## 防火墙配置

```bash
firewall-cmd --permanent --add-port=80/tcp
firewall-cmd --permanent --add-port=443/tcp
firewall-cmd --permanent --add-port=8000/tcp
firewall-cmd --permanent --add-port=3000/tcp
firewall-cmd --permanent --add-port=3001/tcp
firewall-cmd --reload
```

---

## 本地开发连接自托管 Supabase

创建 `/opt/pixel/.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

---

## 常用命令

```bash
# 重启所有服务
docker-compose restart

# 重启特定服务
docker-compose restart pixel

# 查看日志
docker-compose logs -f pixel

# 停止所有服务
docker-compose down

# 重新构建并启动
docker-compose down && docker-compose build && docker-compose up -d
```

---

## 故障排除

### 容器无法启动
```bash
docker-compose logs <service_name>
```

### 数据库连接失败
检查 POSTGRES_PASSWORD 和 JWT_SECRET 是否正确配置

### Auth 认证失败
1. 检查 GOTRUE_JWT_SECRET 与 JWT_SECRET 是否匹配
2. 检查 API_EXTERNAL_URL 是否正确设置

### Realtime 无法连接
检查 PORT 5432 是否对 realtime 容器开放
