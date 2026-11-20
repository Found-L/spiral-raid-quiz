import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

import admin
import server
import social


class AdminTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_database, self.old_admin = server.DATABASE, server.ADMIN_SERVICE
        server.DATABASE = Path(self.temp.name) / 'quiz.sqlite3'
        self.auth = Path(self.temp.name) / 'admin-auth.json'
        self.password = '测试管理员安全密码 LongPass2026!'
        admin.save_password(self.auth, self.password)
        server.ADMIN_SERVICE = self.service = admin.AdminService(self.auth)
        server.initialize()
        self.db = server.database()
        self.person = {'deviceId':'a'*32, 'secret':'1'*64}
        self.other = {'deviceId':'b'*32, 'secret':'2'*64}
        server.profile(self.db, {**self.person,'nickname':'玩家%_甲'})
        server.profile(self.db, {**self.other,'nickname':'玩家乙'})
        answers = {q['id']:list(q['answer']) for q in server.QUESTIONS}
        q = server.QUESTIONS[0]
        answers[q['id']] = [next(o['id'] for o in q['options'] if o['id'] not in q['answer'])]
        server.submit(self.db, {**self.person,'attemptId':'3'*32,'version':server.VERSION,
                               'answers':answers,'elapsedSeconds':600})
        self.db.execute('INSERT INTO social_comments (target_id,author_id,content,created_at,updated_at,state) VALUES (?,?,?,?,?,?)',
                        (self.person['deviceId'],self.other['deviceId'],'测试评价',10,10,'owner_hidden'))
        self.db.execute('INSERT INTO social_reactions VALUES (?,?,?,?)',
                        (self.person['deviceId'],self.other['deviceId'],'fire',11))
        self.context = server.admin_context()
        self.headers = {'Origin':admin.ORIGIN}

    def tearDown(self):
        self.db.close()
        server.DATABASE, server.ADMIN_SERVICE = self.old_database, self.old_admin
        self.temp.cleanup()

    def call(self, route, body=None, headers=None):
        return self.service.dispatch('/api/admin/'+route, body or {}, headers or self.headers, self.db, self.context)

    def login(self):
        payload, cookie = self.call('login', {'password':self.password})
        return {'Origin':admin.ORIGIN, 'Cookie':cookie.split(';',1)[0], 'X-CSRF-Token':payload['csrf']}, cookie

    def test_login_hash_session_csrf_origin_and_logout(self):
        self.assertNotIn(self.password, self.auth.read_text(encoding='utf-8'))
        with self.assertRaises(admin.AdminError) as error:
            self.call('overview')
        self.assertEqual(error.exception.status, 401)
        headers, cookie = self.login()
        self.assertIn('HttpOnly',cookie)
        self.assertIn('Secure',cookie)
        self.assertIn('SameSite=Strict',cookie)
        self.assertIn('Path=/spiral-raid-quiz/api/admin/',cookie)
        self.assertTrue(self.call('session',headers=headers)[0]['authenticated'])
        self.assertEqual(self.call('overview',headers=headers)[0]['players'],2)
        for bad in ({**headers,'Origin':'https://evil.example'}, {**headers,'X-CSRF-Token':'wrong'}):
            with self.assertRaises(admin.AdminError) as error:
                self.call('overview',headers=bad)
            self.assertEqual(error.exception.status,403)
        self.call('logout',headers=headers)
        with self.assertRaises(admin.AdminError):
            self.call('overview',headers=headers)

    def test_rate_limit_expiry_and_password_rotation(self):
        for _ in range(admin.LOGIN_LIMIT):
            with self.assertRaises(admin.AdminError):
                self.call('login',{'password':'wrong'})
        with self.assertRaises(admin.AdminError) as error:
            self.call('login',{'password':self.password})
        self.assertEqual(error.exception.status,429)
        self.service.login_attempts.clear()
        headers, _ = self.login()
        other, _ = self.login()
        new = '另一个更长的新密码 NewPass2027!'
        self.call('password',{'currentPassword':self.password,'newPassword':new},headers)
        with self.assertRaises(admin.AdminError):
            self.call('overview',headers=other)
        with self.assertRaises(admin.AdminError):
            self.call('login',{'password':self.password})
        payload, cookie = self.call('login',{'password':new})
        self.assertTrue(payload['authenticated'])
        self.assertNotIn(new,self.auth.read_text(encoding='utf-8'))
        self.service.sessions[next(iter(self.service.sessions))]['used'] -= admin.SESSION_IDLE+1
        new_headers = {'Origin':admin.ORIGIN, 'Cookie':cookie.split(';',1)[0], 'X-CSRF-Token':payload['csrf']}
        with self.assertRaises(admin.AdminError) as error:
            self.call('overview',headers=new_headers)
        self.assertEqual(error.exception.status,401)

    def test_private_data_views_and_search(self):
        headers, _ = self.login()
        overview = self.call('overview',headers=headers)[0]
        self.assertEqual((overview['players'],overview['attempts'],overview['analyzed']), (2,1,1))
        self.assertEqual(overview['comments'],1)
        self.assertEqual(len(overview['daily']),7)
        found = self.call('players',{'query':'%_'},headers)[0]
        self.assertEqual(found['total'],1)
        self.assertEqual(found['entries'][0]['nickname'],'玩家%_甲')
        self.assertEqual(self.call('players',{'query':'#000001'},headers)[0]['total'],1)
        player = self.call('player',{'playerNumber':1},headers)[0]
        self.assertEqual((player['attemptCount'],player['receivedComments'],player['receivedReactions']),(1,1,1))
        self.assertTrue(player['attempts'][0]['reviewAvailable'])
        self.assertTrue(any(b['name']=='初入寺院' for b in player['badges']))
        attempt = self.call('attempt',{'attemptId':'3'*32},headers)[0]
        self.assertEqual(len(attempt['questions']),1)
        self.assertEqual(attempt['questions'][0]['id'],server.QUESTIONS[0]['id'])
        self.assertNotIn('selected',str(attempt))
        self.assertNotIn('secret',str(player))
        self.assertNotIn(self.person['deviceId'],str(player))
        self.assertEqual(self.call('questions',headers=headers)[0]['entries'][0]['mistakes'],1)
        self.assertTrue(self.call('badges',headers=headers)[0]['entries'])
        comment = self.call('interactions',{'kind':'comments'},headers)[0]['entries'][0]
        self.assertEqual((comment['content'],comment['state']),('测试评价','owner_hidden'))
        self.assertEqual(self.call('interactions',{'kind':'reactions'},headers)[0]['entries'][0]['reaction'],'🔥')

    def test_badge_recipients_use_saved_attempts_and_record_history(self):
        headers, _ = self.login()
        first = self.call('badge-detail',{'badgeId':'first'},headers)[0]
        self.assertEqual((first['total'],first['entries'][0]['number']), (1,1))
        self.assertEqual(first['entries'][0]['achievedAt'], self.db.execute('SELECT submitted_at FROM attempts').fetchone()[0])
        self.assertEqual(first['entries'][0]['timeSource'], '按上传时间')
        record = self.call('badge-detail',{'badgeId':'quickest'},headers)[0]
        self.assertTrue(record['record'])
        self.assertEqual(record['total'],1)
        self.assertTrue(record['entries'][0]['current'])
        self.assertNotIn(self.person['deviceId'],str(record))
        with self.assertRaises(admin.AdminError):
            self.call('badge-detail',{'badgeId':'missing'},headers)

    def test_badge_recipients_paginate_and_keep_earliest_qualifying_upload(self):
        for index in range(21):
            identity = {'deviceId':f'{index+100:032x}','secret':'3'*64}
            server.profile(self.db,{**identity,'nickname':f'玩家{index}'})
            self.db.execute('INSERT INTO attempts VALUES (?,?,?,?,?,?)',
                            (f'{index+1000:032x}',identity['deviceId'],server.VERSION,8,10,index+100))
            self.db.execute('INSERT INTO badge_record_events VALUES (?,?,?)',
                            (identity['deviceId'],'quickest',index+1000))
        headers, _ = self.login()
        page1 = self.call('badge-detail',{'badgeId':'first','page':1},headers)[0]
        page2 = self.call('badge-detail',{'badgeId':'first','page':2},headers)[0]
        self.assertEqual((page1['total'],page1['pages'],len(page1['entries']),len(page2['entries'])),(22,2,20,2))
        self.assertEqual(len({item['number'] for item in page1['entries']+page2['entries']}),22)
        all_entries = page1['entries']+page2['entries']
        self.assertEqual([item['achievedAt'] for item in all_entries], sorted((item['achievedAt'] for item in all_entries), reverse=True))
        record1 = self.call('badge-detail',{'badgeId':'quickest','page':1},headers)[0]
        record2 = self.call('badge-detail',{'badgeId':'quickest','page':2},headers)[0]
        record_entries = record1['entries']+record2['entries']
        self.assertEqual((record1['total'],record1['pages']), (22,2))
        self.assertEqual([item['achievedAt'] for item in record_entries], sorted((item['achievedAt'] for item in record_entries), reverse=True))
        public = server.honor_history_page(self.db,'quickest',1,20)['entries']
        self.assertEqual([item['achievedAt'] for item in public], sorted(item['achievedAt'] for item in public))

    def test_newest_honor_pages_at_all_boundaries(self):
        for total in (0,1,19,20,21,39,40,41,101):
            def history(_db, _badge, page, size):
                pages = max(1,(total+size-1)//size)
                page = min(page,pages)
                return {'page':page,'pages':pages,'total':total,
                        'entries':list(range((page-1)*size,min(page*size,total)))}
            context = {'honor_history_page':history}
            pages = max(1,(total+admin.PAGE_SIZE-1)//admin.PAGE_SIZE)
            combined = []
            for page in range(1,pages+1):
                combined += admin.newest_honor_page(self.db,'quickest',page,context)['entries']
            self.assertEqual(combined,list(reversed(range(total))),f'count {total}')

    def test_report_review_stale_content_and_moderation(self):
        headers, _ = self.login()
        comment = self.db.execute('SELECT id FROM social_comments').fetchone()[0]
        self.db.execute("UPDATE social_comments SET state='visible' WHERE id=?",(comment,))
        social.mutate(self.db,{**self.person,'commentId':comment,'reason':'abuse','details':'请审核'},'report')
        report = self.call('interactions',{'kind':'reports'},headers)[0]['entries'][0]
        self.assertEqual((report['content'],report['status']),('测试评价','pending'))
        self.assertEqual(self.call('overview',headers=headers)[0]['pendingReports'],1)
        self.db.execute("UPDATE social_comments SET content='修改后的评价',updated_at=11 WHERE id=?",(comment,))
        with self.assertRaises(admin.AdminError) as error:
            self.call('moderate',{'commentId':comment,'updatedAt':10,'action':'hide'},headers)
        self.assertEqual(error.exception.status,409)
        self.assertEqual(self.call('interactions',{'kind':'reports'},headers)[0]['entries'][0]['content'],'测试评价')
        self.db.execute("UPDATE social_comments SET state='owner_hidden',content='测试评价',updated_at=10 WHERE id=?",(comment,))
        self.call('moderate',{'commentId':comment,'updatedAt':10,'action':'hide'},headers)
        self.assertEqual(self.db.execute('SELECT state FROM social_comments').fetchone()[0],'admin_hidden')
        self.assertEqual(self.call('interactions',{'kind':'reports','status':'resolved'},headers)[0]['total'],1)
        with self.assertRaises(social.SocialError):
            social.mutate(self.db,{**self.person,'commentId':comment,'hidden':False},'hide')
        self.call('moderate',{'commentId':comment,'updatedAt':10,'action':'restore'},headers)
        self.assertEqual(self.db.execute('SELECT state FROM social_comments').fetchone()[0],'owner_hidden')
        self.call('moderate',{'commentId':comment,'updatedAt':10,'action':'delete'},headers)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM social_comments').fetchone()[0],0)
        self.assertIsNone(self.db.execute('SELECT comment_id FROM social_reports').fetchone()[0])
        self.call('report-resolve',{'reportId':report['id'],'status':'pending'},headers)
        self.assertEqual(self.call('interactions',{'kind':'reports'},headers)[0]['total'],1)
        with self.assertRaises(admin.AdminError):
            self.call('report-resolve',{'reportId':report['id'],'status':'dismissed'}, {**headers,'X-CSRF-Token':'wrong'})

    def test_http_responses_do_not_allow_admin_cors(self):
        httpd = server.QuizServer(('127.0.0.1',0),server.Handler)
        thread = threading.Thread(target=httpd.serve_forever,daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{httpd.server_port}'
        try:
            request = urllib.request.Request(base+'/api/admin/login',data=json.dumps({'password':self.password}).encode(),
                      headers={'Content-Type':'application/json','Origin':admin.ORIGIN},method='POST')
            with urllib.request.urlopen(request) as response:
                self.assertEqual(response.status,200)
                self.assertIsNone(response.headers.get('Access-Control-Allow-Origin'))
                self.assertIn('HttpOnly',response.headers['Set-Cookie'])
                self.assertEqual(response.headers['Cache-Control'],'no-store')
            request = urllib.request.Request(base+'/api/admin/overview',data=b'{}',
                      headers={'Content-Type':'application/json','Origin':'https://found-l.github.io'},method='POST')
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(request)
            self.assertEqual(error.exception.code,403)
            self.assertIsNone(error.exception.headers.get('Access-Control-Allow-Origin'))
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
