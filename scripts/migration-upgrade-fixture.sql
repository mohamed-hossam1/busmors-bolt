INSERT INTO auth.users(id) VALUES ('77777777-7777-4777-8777-777777777777');
INSERT INTO workspaces(id,name) VALUES ('77777777-7777-4777-8777-777777777777','Preserved legacy business');
INSERT INTO workspace_settings(workspace_id,language,onboarding_state) VALUES ('77777777-7777-4777-8777-777777777777','ar','complete');
INSERT INTO brain_nodes(id,workspace_id,category,title,summary,status,source)
 VALUES('77777777-7777-4777-8777-111111111111','77777777-7777-4777-8777-777777777777','offering','Legacy offering','Keep this exact owner text.','approved','manual');
INSERT INTO planned_posts(workspace_id,platform,caption,status,scheduled_for) VALUES
 ('77777777-7777-4777-8777-777777777777','facebook','Legacy published claim','published','2026-11-01T09:00:00Z'),
 ('77777777-7777-4777-8777-777777777777','facebook','Legacy schedule','scheduled','2026-11-25T09:00:00Z');
INSERT INTO deliverables(workspace_id,title,type,content) VALUES('77777777-7777-4777-8777-777777777777','Legacy document','general','Keep the saved document.');
