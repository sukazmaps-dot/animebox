-- Run AFTER monetization-stage1.sql. Atomic, rerunnable, preserves payments.
BEGIN;
LOCK TABLE public.star_payments IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.sponsor_accounts (
 account_key text PRIMARY KEY,
 user_id uuid,
 telegram_id bigint,
 total_stars bigint NOT NULL DEFAULT 0 CHECK(total_stars >= 0),
 payment_count bigint NOT NULL DEFAULT 0 CHECK(payment_count >= 0),
 sponsor_tier text GENERATED ALWAYS AS
 (CASE WHEN total_stars >= 250 THEN 'patron' WHEN total_stars >= 100 THEN 'premium' WHEN total_stars >= 25 THEN 'supporter' ELSE NULL END) STORED,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sponsor_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sponsor_accounts FROM anon, authenticated;
GRANT ALL ON public.sponsor_accounts TO service_role;
REVOKE ALL ON public.star_payments FROM anon, authenticated;
GRANT ALL ON public.star_payments TO service_role;
CREATE INDEX IF NOT EXISTS sponsor_accounts_user_idx ON public.sponsor_accounts(user_id);
CREATE INDEX IF NOT EXISTS sponsor_accounts_telegram_idx ON public.sponsor_accounts(telegram_id) WHERE user_id IS NULL;
-- Invoker: only trusted server payment writes have permission to change totals.
CREATE OR REPLACE FUNCTION public.update_sponsor_account_v2() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE k text;
BEGIN
 IF TG_OP <> 'INSERT' THEN
  k := CASE WHEN OLD.user_id IS NOT NULL THEN 'u:' || OLD.user_id::text ELSE 't:' || OLD.telegram_id::text END;
  UPDATE public.sponsor_accounts SET total_stars = total_stars - OLD.amount,
   payment_count = payment_count - 1, updated_at = now() WHERE account_key = k;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  k := CASE WHEN NEW.user_id IS NOT NULL THEN 'u:' || NEW.user_id::text ELSE 't:' || NEW.telegram_id::text END;
  INSERT INTO public.sponsor_accounts(account_key,user_id,telegram_id,total_stars,payment_count)
   VALUES(k,NEW.user_id,CASE WHEN NEW.user_id IS NULL THEN NEW.telegram_id ELSE NULL END,NEW.amount,1)
  ON CONFLICT(account_key) DO UPDATE SET total_stars = public.sponsor_accounts.total_stars + EXCLUDED.total_stars,
   payment_count = public.sponsor_accounts.payment_count + 1, updated_at = now();
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.update_sponsor_account_v2() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_sponsor_account_v2() TO service_role;
DROP TRIGGER IF EXISTS sponsor_account_v2 ON public.star_payments;
CREATE TRIGGER sponsor_account_v2 AFTER INSERT OR UPDATE OR DELETE ON public.star_payments
 FOR EACH ROW EXECUTE FUNCTION public.update_sponsor_account_v2();
DELETE FROM public.sponsor_accounts;
INSERT INTO public.sponsor_accounts(account_key,user_id,telegram_id,total_stars,payment_count)
 SELECT CASE WHEN user_id IS NOT NULL THEN 'u:' || user_id::text ELSE 't:' || telegram_id::text END,
 user_id,CASE WHEN user_id IS NULL THEN telegram_id ELSE NULL END,sum(amount),count(*)
 FROM public.star_payments GROUP BY 1,2,3;
-- A Telegram identity is used only when it belongs to exactly one profile.
CREATE OR REPLACE VIEW public.sponsor_directory_v2 WITH (security_invoker=true) AS
 WITH links AS (SELECT telegram_id, min(id::text)::uuid AS id FROM public.profiles
  WHERE telegram_id IS NOT NULL GROUP BY telegram_id HAVING count(*)=1),
 accounts AS (SELECT coalesce(a.user_id,l.id) AS user_id,a.telegram_id,a.total_stars,a.payment_count
  FROM public.sponsor_accounts a LEFT JOIN links l ON a.user_id IS NULL AND l.telegram_id=a.telegram_id)
 SELECT CASE WHEN user_id IS NOT NULL THEN 'u:' || user_id::text ELSE 't:' || telegram_id::text END AS account_key,
 user_id, sum(total_stars)::bigint AS total_stars, sum(payment_count)::bigint AS payment_count,
 CASE WHEN sum(total_stars)>=250 THEN 'patron' WHEN sum(total_stars)>=100 THEN 'premium'
 WHEN sum(total_stars)>=25 THEN 'supporter' ELSE NULL END AS sponsor_tier
 FROM accounts GROUP BY 1,2 HAVING sum(total_stars)>0;
CREATE OR REPLACE VIEW public.sponsor_metrics_v2 WITH (security_invoker=true) AS
 SELECT coalesce(sum(total_stars),0)::bigint AS total_stars,
 coalesce(sum(payment_count),0)::bigint AS payment_count,
 count(*) FILTER(WHERE sponsor_tier IS NOT NULL) AS sponsors,
 count(*) FILTER(WHERE sponsor_tier='supporter') AS supporter,
 count(*) FILTER(WHERE sponsor_tier='premium') AS premium,
 count(*) FILTER(WHERE sponsor_tier='patron') AS patron
 FROM public.sponsor_directory_v2;
REVOKE ALL ON public.sponsor_directory_v2,public.sponsor_metrics_v2 FROM anon,authenticated;
GRANT SELECT ON public.sponsor_directory_v2,public.sponsor_metrics_v2 TO service_role;
COMMIT;
