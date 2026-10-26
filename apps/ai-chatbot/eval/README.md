# RAG 评测集

## 文件

| 路径 | 说明 |
|------|------|
| `datasets/rag-gold.json` | 问题 + 标准答案 + 应召回文档标题 |
| `types.ts` | TypeScript 类型 |
| `metrics.ts` | Recall@K / Precision@K / Hit@K |
| `../scripts/eval-retrieval.mjs` | 自动跑检索并汇总指标 |

当前覆盖知识库文档：

- 如何重置登录密码
- 焦虑时的简单呼吸练习
- 今日天气与出行建议
- 番茄肉酱意面简易做法
- Next.js 接口报错排查步骤

另含 **负例**（`expectInKb: false`）：不参与三项指标平均，仅在报告中列出。

## 自动评测

先启动应用（需已 seed 文档）：

```bash
cd apps/ai-chatbot
pnpm dev
```

另开终端：

```bash
# 默认 hybrid，K=5
pnpm eval:retrieval

# 对比三种 mode
pnpm eval:retrieval -- --mode=all --k=5

# 指定 API 与输出报告
pnpm eval:retrieval -- --base=http://127.0.0.1:3000 --mode=hybrid --k=5 --out=eval/reports/latest.json
```

指标（文档标题粒度，top-K hit 去重后的文档集合）：

| 指标 | 含义 |
|------|------|
| Recall@K | 相关文档中被找回的比例 |
| Precision@K | 返回文档中相关的比例 |
| Hit@K | top-K 是否命中任一相关文档（0/1，再平均） |

## 字段说明

- `query`：评测问题  
- `relevantTitles`：检索应命中的文档标题  
- `answer` / `answerKeyPoints`：生成评测用（本脚本只做检索指标）  
- `expectInKb`：是否期望从知识库答出  

## 扩展

向 `cases` 追加对象即可；`relevantTitles` 须与 seed 后的 `Document.title` 一致。
