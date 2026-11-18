# 剑灵巅峰服 · 螺旋寺院机制考核

在线地址：<https://found-l.github.io/spiral-raid-quiz/>

免注册填写昵称后即可答题。题库共 87 道客观题，覆盖灼热剑与酷寒剑、超魔灵、黑风魔女，以及主 T、控制、挡球、加血、业火、炸弹和蜘蛛等位置。完成后自动评分并展示逐题解析；排行榜保留每个身份的最高分，同分按首次达到该成绩的时间排序。

题目依据螺旋寺院在巅峰服上线后的实战资料和提供的魔女试卷编写。题目直接描述阶段、机制和操作；涉及团队分工时，按题干中的团队安排作答。实战请以当前版本和团长安排为准。图为分工示意。

## 昵称与成绩

- 无需注册或填写游戏 ID；系统在当前浏览器自动生成身份，同名昵称可以并存。
- 昵称可以修改；昵称、成绩和答题时间会显示在公共排行榜上。成绩服务保存答题结果和昵称，不验证游戏角色归属。
- 答题进度保存在当前浏览器。更换设备或清除浏览器数据前，可在资料弹窗中备份身份码，之后用它恢复原有身份。身份码具有修改资料的能力，请勿公开。
- 可在资料弹窗中删除自己的线上资料和成绩。题目与答案公开，排行榜仅用于团队学习，不能作为防作弊考试。

## 项目结构

- `index.html` 是包含样式、脚本、题库和插图的独立网页，由 GitHub Pages 托管。
- `template.html`、`style.css`、`app.js`、`questions.json` 和 `build_questions.py` 是网页源码；运行 `python build_questions.py` 生成前后端题库，再运行 `python build_page.py` 生成网页。
- `backend-source/` 是共享计分与排行榜服务的源码快照；线上服务运行于 Sites，使用 D1 数据库。更新题库后，前后端必须使用同一份题库和版本号，再分别发布网页和服务。

## 巅峰服参考

- [双剑教学，2026-10-22](https://www.bilibili.com/video/BV15uny6qENV/)
- [双剑换边补充，2026-10-22](https://www.bilibili.com/video/BV1d9n265EyM/)
- [超魔灵教学，2026-11-13](https://www.bilibili.com/video/BV1rFWY6REex/)
- [超魔灵机制补充，2026-10-24](https://www.bilibili.com/video/BV1rQHP6zE56/)
- [黑风魔女教学，2026-11-08](https://www.bilibili.com/video/BV1Gh4x6wEAt/)
- [黑风魔女主 T 实战，2026-10-28](https://www.bilibili.com/video/BV1o1x36hEC6/)

各视频为玩家的讲解和示范，团队可以依据实际配置调整具体打法。
