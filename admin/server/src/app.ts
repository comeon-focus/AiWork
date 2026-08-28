import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRouter from './modules/auth/auth.router.js';
import userRouter from './modules/user/user.router.js';
import roleRouter from './modules/role/role.router.js';
import menuRouter from './modules/menu/menu.router.js';
import deptRouter from './modules/dept/dept.router.js';
import codeRepoRouter from './modules/codeRepo/codeRepo.router.js';
import requirementRouter from './modules/requirement/requirement.router.js';
import smartDocRouter from './modules/smartDoc/smartDoc.router.js';
import demandRouter from './modules/demand/demand.router.js';
import aiTaskRouter from './modules/aiTask/aiTask.router.js';
import aiSubTaskRouter from './modules/aiSubTask/aiSubTask.router.js';
import aiCompileLogRouter from './modules/aiCompileLog/aiCompileLog.router.js';
import aiGitCommitRouter from './modules/aiGitCommit/aiGitCommit.router.js';
import taskQueueRouter from './modules/taskQueue/taskQueue.router.js';
import dataSimRouter from './modules/dataSim/dataSim.router.js';
import dataSimInterfaceRouter from './modules/dataSim/dataSimInterface.router.js';
import dataTaskRouter from './modules/dataTask/dataTask.router.js';
import mockRouter from './modules/dataSim/mock.router.js';
import logRouter from './modules/log/log.router.js';
import configRouter from './modules/config/config.router.js';
import { REQUIREMENT_UPLOAD_DIR } from './middleware/upload.js';
import './models/index.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 上传的附件：经 Vite 代理以同源 /api 访问；<img>/<a> 无法携带 token，故此处不鉴权
  app.use('/api/uploads', express.static(REQUIREMENT_UPLOAD_DIR));

  app.get('/api/health', (_req, res) => {
    res.json({ code: 0, msg: 'ok', data: { time: new Date().toISOString() } });
  });

  // 登录相关：/login /refresh 免鉴权，/profile 自行挂 authenticate
  app.use('/api/auth', authRouter);

  // 其余业务接口统一要求登录，权限码在各路由上单独声明
  app.use('/api/users', authenticate, userRouter);
  app.use('/api/roles', authenticate, roleRouter);
  app.use('/api/menus', authenticate, menuRouter);
  app.use('/api/depts', authenticate, deptRouter);
  app.use('/api/repos', authenticate, codeRepoRouter);
  app.use('/api/requirements', authenticate, requirementRouter);
  app.use('/api/smart-docs', authenticate, smartDocRouter);
  app.use('/api/demands', authenticate, demandRouter);
  app.use('/api/ai-tasks', authenticate, aiTaskRouter);
  app.use('/api/ai-sub-tasks', authenticate, aiSubTaskRouter);
  app.use('/api/ai-compile-logs', authenticate, aiCompileLogRouter);
  app.use('/api/ai-git-commits', authenticate, aiGitCommitRouter);
  app.use('/api/task-queues', authenticate, taskQueueRouter);
  app.use('/api/data-sim', authenticate, dataSimRouter);
  app.use('/api/data-sim-interfaces', authenticate, dataSimInterfaceRouter);
  app.use('/api/data-tasks', authenticate, dataTaskRouter);
  app.use('/api/logs', authenticate, logRouter);
  app.use('/api/configs', authenticate, configRouter);

  // 数据模拟对外调用入口（免鉴权），需在 notFoundHandler 之前挂载
  app.use('/mock', mockRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
