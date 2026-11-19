# 国内成绩服务

`server.py` 使用 Python 3.12 标准库和 SQLite；生产服务监听 `127.0.0.1:8791`，由 Nginx 的 `/spiral-raid-quiz/api/` 反向代理。GitHub 和国内网页使用相同的 API、排行榜及数据库；旧 Sites API 转发到同一服务。

生产文件位于 `/opt/spiral-raid-quiz/app/`，网页位于 `/opt/spiral-raid-quiz/public/index.html`，数据库位于 `/var/lib/spiral-raid-quiz/quiz.sqlite3`。服务和数据由独立的 `spiral-quiz` 系统账号运行和保护。

`spiral-raid-quiz-backup.timer` 每天创建 SQLite 一致性快照，保留最近 14 份，目录为 `/var/lib/spiral-raid-quiz/backups/`。备份位于同一台服务器，应另行定期复制到其他受保护的位置；身份哈希及答题记录不可公开。手动备份可运行 `systemctl start spiral-raid-quiz-backup.service`。

更新题库时，在项目根目录运行 `python build_questions.py` 和 `python build_page.py`，使网页和 `domestic-backend/questions.json` 版本一致。`banks/` 保留旧题库，服务按提交的版本评分，历史记录保留所有版本。`/api/leaderboard?view=latest` 综合每位玩家的最新已完成题库版本，同版本取最高分；分数相同按用时、上传时间排序。`version` 参数可查询单个题库版本；无参数保持旧客户端的当前版本行为。旧记录没有用时，显示为未记录。

`/api/badges` 和 `/api/badges/select` 使用现有浏览器身份校验勋章及展示选择。勋章由已保存的成绩计算，最多展示 3 枚；未选择时自动展示，明确保存空列表时不展示。最快勋章按全站所有已计时答卷的最低用时实时计算，并列均获得；无计时的旧成绩不参与。选择写入独立的 `badge_selections` 表，删除个人资料时级联清除，不改写历史成绩。

部署时先备份数据库，将服务、新题库与旧题库归档安装到服务目录并重启 `spiral-raid-quiz.service`，再更新网页和 GitHub Pages。服务启动时会创建独立的用时表，原有成绩表保持不变，备份仍按原方式执行。变更 Nginx 时先执行 `nginx -t`，通过后才 reload，并检查现有网站和 API 的健康状态。原网站的 Nginx 配置含有 `include /etc/nginx/snippets/spiral-raid-quiz.conf;`，重新生成配置时需保留该行。

本地校验：

```sh
python -m unittest discover -s domestic-backend -p 'test_*.py'
```

迁移脚本 `import_snapshot.py` 只接受空数据库，并在同一事务内导入身份、玩家编号、成绩和编号序列；任一校验失败会回滚。不要对已经接收玩家成绩的数据库再次执行导入。
