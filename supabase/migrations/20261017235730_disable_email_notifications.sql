-- Email notifications are intentionally disabled for this deployment.
-- Applications are reviewed manually through the authenticated admin dashboard.
alter table public.employment_applications
  drop constraint if exists employment_applications_notification_status_check;

alter table public.employment_applications
  add constraint employment_applications_notification_status_check
  check (notification_status in ('pending', 'sent', 'failed', 'disabled'));
