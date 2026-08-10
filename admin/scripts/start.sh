#!/usr/bin/env bash
# 一键启动前后端（Linux & macOS 通用，不依赖 launchd）
#   后端 server  -> http://localhost:3000
#   前端 web     -> http://localhost:5173
# 首次运行（无 .env）会自动执行 ./setup.sh 完成初始化。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# 若环境用 nvm 管理 node，自动加载（没有则忽略）
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# 首次运行：缺少 .env 时先走一遍初始化
if [ ! -f "server/.env" ]; then
  echo "未检测到 server/.env，先执行初始化..."
  bash "$SCRIPT_DIR/setup.sh"
fi

echo "==> 启动前后端 (npm run dev: server@3000 + web@5173)"
echo "    按 Ctrl+C 停止；后台运行可用: nohup ./scripts/start.sh > start.log 2>&1 &"
exec npm run dev
