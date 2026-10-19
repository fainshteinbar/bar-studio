-- ############################################################################
-- ##  FOR THE TEST PROJECT bfain-docs-test ONLY. NEVER RUN THIS IN bfain-docs.  ##
-- ############################################################################
-- Run once in bfain-docs-test, after install.sql. It marks the project as the test project,
-- which is what allows dev/reset_test.sql to run there. Without this marker the reset refuses.

create table if not exists app.test_project_marker (note text not null);
insert into app.test_project_marker (note) select 'bfain-docs-test'
 where not exists (select 1 from app.test_project_marker);
