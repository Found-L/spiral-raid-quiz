# 国内成绩服务

`server.py` 使用 Python 3.12 标准库和 SQLite；生产服务监听 `127.0.0.1:8791`，由 Nginx 的 `/spiral-raid-quiz/api/` 反向代理。GitHub 和国内网页使用相同的 API、排行榜及数据库；旧 Sites API 转发到同一服务。

生产文件位于 `/opt/spiral-raid-quiz/app/`，网页位于 `/opt/spiral-raid-quiz/public/index.html`，数据库位于 `/var/lib/spiral-raid-quiz/quiz.sqlite3`。服务和数据由独立的 `spiral-quiz` 系统账号运行和保护。

`spiral-raid-quiz-backup.timer` 每天创建 SQLite 一致性快照，保留最近 14 份，目录为 `/var/lib/spiral-raid-quiz/backups/`。备份位于同一台服务器，应另行定期复制到其他受保护的位置；身份哈希及答题记录不可公开。手动备份可运行 `systemctl start spiral-raid-quiz-backup.service`。

更新题库时，在项目根目录运行 `python build_questions.py` 和 `python build_page.py`，使网页和 `domestic-backend/questions.json` 版本一致。`banks/` 保留旧题库，服务按提交的版本评分，历史记录保留所有版本。`/api/leaderboard?view=latest` 综合每位玩家的最新已完成题库版本，同版本取最高分；分数相同按用时、上传时间排序。`version` 参数可查询单个题库版本；无参数保持旧客户端的当前版本行为。榜单支持 `page`（从 1 开始）和 `pageSize`（1 至 100），返回总人数、总页数和全局排名；不传分页参数时兼容旧客户端并返回前 100 名。旧记录没有用时，显示为未记录。

`/api/badges` 和 `/api/badges/select` 使用现有浏览器身份校验勋章及展示选择。成绩类勋章由已保存的成绩计算，最多展示 3 枚；未选择时自动展示成绩类勋章，明确保存空列表时不展示。机制趣味勋章依据经评分校验的指定错误选项解锁，只记录对应勋章、不存逐题答案，并由本人选择后才公开展示。服务先前没有保存答案，无法给已上传的旧成绩反推错题勋章；新收到的 v5 至 v8 答卷按各自题库判定。最快勋章按全站所有已计时答卷的最低用时实时计算，并列均获得；无计时的旧成绩不参与。客户端从 v7 起仅记录答题页前台时间，旧时间可能包含离开页面的时间；用时由客户端提交，不提供防作弊保障。选择与错题勋章分别写入独立表，删除个人资料时级联清除，不改写历史成绩。

`/api/honors` 提供四项全站趣味榜：不限分数的最短用时、累计完成轮数（至少 2 轮）、累计满分次数（至少 1 次）和满分答卷最短用时。统计所有已上传的新旧题库答卷，每人每项取其记录；计时榜排除未记录用时的答卷。首页每项返回前 5 人、全部并列第一的人数和上榜人数；同成绩优先按达到该成绩的时间升序，时间也相同则按榜单编号排序。新答卷使用浏览器记录的完成时间（异常时间回退至上传时间），旧答卷没有完成时间时使用上传时间。`/api/honors?badge=quickest&mode=current&page=1&pageSize=20` 分页提供完整当前榜单；`mode=history` 按现存答卷的完成时间与当前规则推算历史获得者，并标识是否仍持有。相同毫秒的答卷作为一批计算，删除的记录无法还原，缺少用时的答卷不参与计时榜。所有并列第一者都获得对应的实时纪录勋章，纪录被超越时失去资格；历史名单不改变勋章或答卷。完成时间与用时由浏览器提交，属于娱乐统计而非防作弊排名。

部署时先备份数据库，将服务、新题库与旧题库归档安装到服务目录并重启 `spiral-raid-quiz.service`，再更新网页和 GitHub Pages。服务启动时会创建独立的用时表，原有成绩表保持不变，备份仍按原方式执行。变更 Nginx 时先执行 `nginx -t`，通过后才 reload，并检查现有网站和 API 的健康状态。原网站的 Nginx 配置含有 `include /etc/nginx/snippets/spiral-raid-quiz.conf;`，重新生成配置时需保留该行。

本地校验：

```sh
python -m unittest discover -s domestic-backend -p 'test_*.py'
```

迁移脚本 `import_snapshot.py` 只接受空数据库，并在同一事务内导入身份、玩家编号、成绩和编号序列；任一校验失败会回滚。不要对已经接收玩家成绩的数据库再次执行导入。
