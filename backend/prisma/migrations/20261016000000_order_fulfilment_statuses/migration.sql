-- Bring existing orders into the updated six-stage fulfilment workflow.
-- The former SHIPPED status is closest to ON_DELIVERY and remains a terminal
-- forward-only stage. Other statuses (including CANCELLED) remain unchanged.
UPDATE "Order"
SET "status" = 'ON_DELIVERY'
WHERE "status" = 'SHIPPED';
