import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // =====================================================================
  //  Monorepo & 依赖编译
  // =====================================================================

  /**
   * 转译 workspace TypeScript 源码包。
   *
   * 这些包以 .ts 源文件形式存在（未经预编译），Next.js 需要在打包时将其转译。
   * 不配置此项会导致 "Unexpected token 'export'" 之类的语法错误。
   *
   * 包含的包：
   * - @myworkspace/LRUCache   — LRU 缓存类（Map 实现，容量 3）
   * - @myworkspace/fetch      — 增强 fetch（缓存/去重/拦截器/超时）
   * - @myworkspace/indexedDB  — IndexedDB 事务封装（批量读写）
   */
  transpilePackages: [
    '@myworkspace/LRUCache',
    '@myworkspace/fetch',
    '@myworkspace/indexedDB',
  ],

  // =====================================================================
  //  Turbopack 配置
  // =====================================================================

  turbopack: {
    /**
     * Monorepo 根目录（绝对路径）。
     *
     * 目的：
     * 1. 确保 Turbopack 能解析 workspace 包中的符号链接
     * 2. 开发模式下监听 workspace 文件变更，使 HMR 生效
     *
     * Next.js 16 会自动从 pnpm-lock.yaml 检测根目录，
     * 此处显式指定是为了消除边界情况（如 CI 环境）。
     */
    root: path.resolve(__dirname, '../..'),
  },

  // =====================================================================
  //  生产构建优化
  // =====================================================================

  /**
   * 输出独立可运行目录（.next/standalone），供 Docker 瘦镜像使用。
   * 包含最小 node_modules 与 server.js，无需在 runner 阶段再 pnpm install。
   */
  output: 'standalone',

  experimental: {
    /**
     * 包导入优化（Tree Shaking）。
     *
     * 项目使用 `lodash`（非 `lodash-es`），而 Next.js 默认优化列表
     * 只包含 `lodash-es`。手动添加后，只打包实际 import 的函数，
     * 而非整个 lodash 库（~530KB → ~60KB，减少约 90%）。
     *
     * 默认已优化的包（无需手动添加）：
     * antd, @ant-design/icons, @ant-design/x 等。
     */
    optimizePackageImports: ['lodash'],
  },

  // =====================================================================
  //  安全配置
  // =====================================================================

  /**
   * 隐藏 X-Powered-By 响应头。
   * 默认情况下 Next.js 会在 HTTP 响应中包含 `X-Powered-By: Next.js`，
   * 这会暴露技术栈信息，增加针对性攻击的风险。
   */
  poweredByHeader: false,

  /**
   * 自定义 HTTP 安全响应头。
   *
   * 应用于所有路由（`/:path*`），提供基础安全防护：
   *
   * | Header                     | 值                                | 作用                         |
   * |----------------------------|-----------------------------------|------------------------------|
   * | X-Frame-Options            | DENY                              | 禁止页面被 iframe 嵌入       |
   * | X-Content-Type-Options     | nosniff                           | 禁止 MIME 类型嗅探           |
   * | Referrer-Policy            | strict-origin-when-cross-origin   | 跨域时仅发送 origin 作为引荐 |
   * | X-DNS-Prefetch-Control     | on                                | 允许 DNS 预解析              |
   * | Permissions-Policy         | camera/mic/geolocation=()         | 禁用摄像头/麦克风/定位       |
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },

  // =====================================================================
  //  运行时优化（显式声明默认值，表明优化意图）
  // =====================================================================

  /**
   * Gzip 压缩。
   * 默认开启，对文本类资源（HTML/CSS/JS/JSON）进行压缩传输，
   * 通常可减少 60-80% 传输体积。
   */
  compress: true,

  /**
   * 生产环境禁用浏览器 source map。
   * source map 在生产环境会暴露源码结构和注释，存在安全风险。
   * 仅在需要线上调试时临时开启。
   */
  productionBrowserSourceMaps: false,

  /**
   * React Strict Mode（严格模式）。
   * App Router 从 Next.js 13.5.1 起默认开启。
   * 开发阶段会双重调用某些函数以检测副作用，帮助发现潜在 bug。
   */
  reactStrictMode: true,

  // =====================================================================
  //  开发体验
  // =====================================================================

  logging: {
    fetches: {
      /**
       * 开发模式下在终端打印完整的 fetch URL。
       * 方便调试 API 调用（如 /api/chat、/api/systemprompt），
       * 可以看到完整的 query string 和请求路径。
       */
      fullUrl: true,
    },
  },

  serverExternalPackages: [
    '@xenova/transformers',
    '@lancedb/lancedb',
    'apache-arrow',
    // pdf-parse / pdfjs：避免被打进 bundle 后找不到 pdf.worker.mjs
    'pdf-parse',
    'pdfjs-dist',
  ],
};

export default nextConfig;
