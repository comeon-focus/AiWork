#!/usr/bin/env bash
# 一键初始化环境（新机器/新拷贝后只需跑一次）
# 适用 Linux & macOS，依赖：bash、node>=20.19、本地 MySQL（已启动且可连接）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# 若环境用 nvm 管理 node，自动加载（没有则忽略）
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

echo "==> [1/5] 检查 Node 版本 (需要 >= 20.19)"
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "错误: 未找到 node，请先安装 Node >= 20.19" >&2
  exit 1
fi
NODE_VER="$("$NODE_BIN" -v | sed 's/^v//')"
REQ="20.19.0"
if [ "$(printf '%s\n%s\n' "$REQ" "$NODE_VER" | sort -V | head -n1)" != "$REQ" ]; then
  echo "错误: Node 版本过低 ($NODE_VER)，需要 >= $REQ" >&2
  exit 1
fi
echo "    node v$NODE_VER ok"

echo "==> [2/5] 安装依赖 (npm install, workspaces)"
npm install

echo "==> [3/5] 准备 .env"
ENV_FILE="server/.env"
if [ -f "$ENV_FILE" ]; then
  echo "    $ENV_FILE 已存在，保留（如需按模板重建请先删除它再重跑）"
else
  cp server/.env.example "$ENV_FILE"
  echo "    已从 .env.example 生成 $ENV_FILE，可按需修改数据库连接"
fi

# 读取 .env 中的 DB 连接（与 config 默认值保持一致，避免重复配置）
DB_HOST="127.0.0.1"
DB_PORT="3306"
if [ -f "$ENV_FILE" ]; then
  while IFS='=' read -r k v; do
    case "$k" in
      DB_HOST) DB_HOST="$v" ;;
      DB_PORT) DB_PORT="$v" ;;
    esac
  done < <(grep -E '^(DB_HOST|DB_PORT)=' "$ENV_FILE")
fi

echo "==> [4/5] 等待 MySQL 可用 ($DB_HOST:$DB_PORT)"
wait_for_port() {
  local host="$1" port="$2" tries=60 i=0
  while [ "$i" -lt "$tries" ]; do
    if (exec 3<>"/dev/tcp/$host/$port") 2>/dev/null; then
      exec 3>&- 3<&-
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}
if wait_for_port "$DB_HOST" "$DB_PORT"; then
  echo "    MySQL 端口可达"
else
  echo "错误: $DB_HOST:$DB_PORT 在 60s 内不可达，请先启动本地 MySQL 后重试" >&2
  exit 1
fi

echo "==> [5/5] 初始化数据库 (建库 + 建表 + 种子数据)"
npm run db:init

echo ""
echo "✅ 初始化完成。运行 ./scripts/start.sh 启动前后端服务。"
