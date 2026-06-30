-- AddCheckConstraint
ALTER TABLE "follow" ADD CONSTRAINT "follow_no_self_follow_check" CHECK ("follower_id" <> "following_id");
