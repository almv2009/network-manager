PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  organization_id TEXT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  organization_name TEXT,
  summary TEXT NOT NULL,
  details TEXT NOT NULL,
  steps_to_reproduce TEXT,
  expected_outcome TEXT,
  actual_outcome TEXT,
  current_path TEXT,
  active_tab TEXT,
  screenshot_name TEXT,
  screenshot_content_type TEXT,
  screenshot_data_url TEXT,
  target_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  admin_notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets (created_at DESC);

CREATE TABLE IF NOT EXISTS alternative_payment_requests (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  user_id TEXT,
  organization_id TEXT,
  full_name TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  seat_count INTEGER NOT NULL,
  preferred_payment_method TEXT NOT NULL CHECK (preferred_payment_method IN ('wise', 'e_transfer', 'cheque', 'eft')),
  country TEXT NOT NULL,
  region TEXT,
  po_number TEXT,
  notes TEXT,
  request_status TEXT NOT NULL CHECK (request_status IN ('submitted', 'reviewing', 'awaiting_payment', 'paid', 'activated', 'rejected', 'cancelled')),
  admin_notes TEXT,
  approved_at TEXT,
  approved_by TEXT,
  activation_starts_at TEXT,
  activation_ends_at TEXT,
  external_reference TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_alt_payment_status_created ON alternative_payment_requests (request_status, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('stripe', 'manual')),
  stripe_event_id TEXT,
  stripe_checkout_session_id TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  organization_name TEXT,
  contact_email TEXT COLLATE NOCASE,
  plan_id TEXT,
  plan_name TEXT,
  amount_minor INTEGER,
  currency TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  user_id TEXT,
  organization_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_events_created ON billing_events (created_at DESC);
