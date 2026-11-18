# 国内成绩服务

`server.py` 使用 Python 3.12 标准库和 SQLite；生产服务监听 `127.0.0.1:8791`，由 Nginx 的 `/spiral-raid-quiz/api/` 反向代理。GitHub 和国内网页使用相同的 API、排行榜及数据库；旧 Sites API 转发到同一服务。

生产文件位于 `/opt/spiral-raid-quiz/app/`，网页位于 `/opt/spiral-raid-quiz/public/index.html`，数据库位于 `/var/lib/spiral-raid-quiz/quiz.sqlite3`。服务和数据由独立的 `spiral-quiz` 系统账号运行和保护。

`spiral-raid-quiz-backup.timer` 每天创建 SQLite 一致性快照，保留最近 14 份，目录为 `/var/lib/spiral-raid-quiz/backups/`。备份位于同一台服务器，应另行定期复制到其他受保护的位置；身份哈希及答题记录不可公开。手动备份可运行 `systemctl start spiral-raid-quiz-backup.service`。

更新题库时，在项目根目录运行 `python build_questions.py` 和 `python build_page.py`，使网页和 `domestic-backend/questions.json` 版本一致。部署时先备份数据库，将新的网页与题库分别安装到上述位置并重启 `spiral-raid-quiz.service`；再更新 GitHub Pages。变更 Nginx 时先执行 `nginx -t`，通过后才 reload，并检查现有网站和 API 的健康状态。原网站的 Nginx 配置含有 `include /etc/nginx/snippets/spiral-raid-quiz.conf;`，重新生成配置时需保留该行。

本地校验：

```sh
python -m unittest discover -s domestic-backend -p 'test_*.py'
```

迁移脚本 `import_snapshot.py` 只接受空数据库，并在同一事务内导入身份、玩家编号、成绩和编号序列；任一校验失败会回滚。不要对已经接收玩家成绩的数据库再次执行导入。
