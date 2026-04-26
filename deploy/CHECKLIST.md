# ============================================
# Pixel 部署检查清单
# ============================================

## 服务器环境检查

### 1. Docker 安装验证
```bash
docker --version
docker-compose --version
```

### 2. 防火墙配置
```bash
# 开放必要端口 (自托管环境)
firewall-cmd --permanent --add-port=80/tcp
firewall-cmd --permanent --add-port=443/tcp
firewall-cmd --permanent --add-port=3002/tcp  # Next.js
firewall-cmd --permanent --add-port=8001/tcp  # Kong API Gateway
firewall-cmd --permanent --add-port=3003/tcp  # Supabase Studio
firewall-cmd --permanent --add-port=5433/tcp # PostgreSQL
firewall-cmd --reload
```

### 3. 服务状态检查
```bash
# 查看所有容器
docker-compose ps

# 查看日志
docker-compose logs -f

# 检查特定服务
docker-compose logs postgres --tail=50
docker-compose logs kong --tail=50
docker-compose logs gotrue --tail=50
```

### 4. 数据库验证
```bash
# 连接数据库
docker-compose exec postgres psql -U postgres -d postgres

# 查看表
\dt

# 测试查询
SELECT 1 as test;
```

### 5. API 测试
```bash
# 测试 REST API
curl http://localhost:8001/rest/v1/

# 测试 Auth
curl http://localhost:8001/auth/v1/health

# 测试 Storage
curl http://localhost:8001/storage/v1/health
```

### 6. Supabase Studio 访问
- 访问 http://112.124.48.49:3003
- 检查 SQL Editor 是否可用
- 检查 Database 页面是否显示表

## 验证完成标志

- [ ] `docker-compose ps` 所有服务 Up
- [ ] `docker-compose exec postgres psql -c "\dt"` 显示所有表
- [ ] Studio SQL Editor 能执行简单查询
- [ ] Next.js 应用页面加载正常
- [ ] 用户注册/登录功能正常
- [ ] 教师创建房间正常
- [ ] 学生加入房间正常

## 常见问题排查

### 容器启动失败
```bash
# 查看详细日志
docker-compose logs [service_name]

# 常见问题:
# - 端口冲突: 检查 3000, 8000, 5432 等端口是否被占用
# - 权限问题: 检查目录权限 ls -la /opt/pixel
```

### 数据库连接失败
```bash
# 检查 postgres 容器
docker-compose exec postgres psql -U postgres -d postgres

# 如果失败，检查日志
docker-compose logs postgres
```

### Kong 网关问题
```bash
# 检查 Kong 配置
docker-compose exec kong kong config parse /var/lib/kong/kong.yml

# 检查 Kong 日志
docker-compose logs kong
```

## 完全重置数据库

```bash
cd /opt/pixel
docker-compose down -v
docker-compose up -d
sleep 30
docker-compose ps
```