INSERT INTO organizations (id, name, status, settings_json, created_at, updated_at)
VALUES (
  'org_demo_network_manager',
  'Demo Safeguarding Partnership',
  'active',
  '{"closedCaseSupervisorAccess": false, "brandingName": "Demo Safeguarding Partnership"}',
  '2026-04-01T00:00:00.000Z',
  '2026-04-01T00:00:00.000Z'
);

INSERT INTO users (id, organization_id, external_identity_id, email, display_name, user_type, active, created_at, updated_at)
VALUES
  ('user_demo_admin', 'org_demo_network_manager', NULL, 'admin@example.org', 'Organization Admin', 'org_admin', 1, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('user_demo_worker', 'org_demo_network_manager', NULL, 'worker@example.org', 'Case Worker', 'worker', 1, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('user_demo_supervisor', 'org_demo_network_manager', NULL, 'supervisor@example.org', 'Supervisor', 'supervisor', 1, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('user_demo_caregiver', 'org_demo_network_manager', NULL, 'caregiver@example.org', 'Primary Caregiver', 'caregiver', 1, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('user_demo_network', 'org_demo_network_manager', NULL, 'network@example.org', 'Network Support', 'network_member', 1, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');

INSERT INTO cases (id, organization_id, family_name, status, state_json, created_by, created_at, closed_at, updated_at)
VALUES (
  'case_demo_miller',
  'org_demo_network_manager',
  'Miller Family',
  'open',
  '{}',
  'user_demo_admin',
  '2026-04-01T00:00:00.000Z',
  NULL,
  '2026-04-01T00:00:00.000Z'
);

INSERT INTO case_memberships (id, case_id, user_id, role, active, invited_by, invited_at, access_scope_json, created_at, updated_at)
VALUES
  ('membership_demo_worker', 'case_demo_miller', 'user_demo_worker', 'worker', 1, 'user_demo_admin', '2026-04-01T00:00:00.000Z', '{}', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('membership_demo_supervisor', 'case_demo_miller', 'user_demo_supervisor', 'supervisor', 1, 'user_demo_admin', '2026-04-01T00:00:00.000Z', '{}', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('membership_demo_caregiver', 'case_demo_miller', 'user_demo_caregiver', 'caregiver', 1, 'user_demo_admin', '2026-04-01T00:00:00.000Z', '{}', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
  ('membership_demo_network', 'case_demo_miller', 'user_demo_network', 'network_member', 1, 'user_demo_admin', '2026-04-01T00:00:00.000Z', '{}', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');

INSERT INTO audit_events (id, organization_id, case_id, actor_user_id, event_type, metadata_json, created_at)
VALUES
  ('audit_demo_case_open', 'org_demo_network_manager', 'case_demo_miller', 'user_demo_admin', 'case_opened', '{"note":"Demo seed case opened."}', '2026-04-01T00:00:00.000Z');
