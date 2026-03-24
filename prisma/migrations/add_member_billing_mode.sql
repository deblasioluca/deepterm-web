-- Add memberBillingMode to Organization
-- Values: 'org_covers' (default), 'self_pay', 'hybrid'
ALTER TABLE Organization ADD COLUMN memberBillingMode TEXT NOT NULL DEFAULT 'org_covers';

-- Add seatCoveredByOrg to OrganizationUser
-- Tracks whether the org covers this member's seat cost
ALTER TABLE OrganizationUser ADD COLUMN seatCoveredByOrg BOOLEAN NOT NULL DEFAULT 1;
