-- Expose deposit_percent on the tourist-facing public_boats view so the booking
-- form can show the correct deposit before a tourist books. Appended at the end so
-- create or replace view accepts it.

create or replace view public.public_boats as
 select b.id,
    b.owner_id,
    b.name,
    b.boat_type,
    b.capacity,
    b.description,
    b.location,
    b.price_per_hour,
    b.price_per_day,
    b.facilities,
    b.safety_equipment,
    b.crew_included,
    b.fuel_policy,
    b.registration_number,
    b.capacity AS max_guests,
    b.maintenance_status,
    b.created_at,
    p.business_name AS operator_name,
    p.phone AS operator_phone,
    p.verification_status = 'verified'::verification_status AS operator_verified,
    p.trust_score AS operator_trust_score,
    b.deposit_percent
   FROM boats b
     JOIN profiles p ON p.id = b.owner_id
  WHERE b.status = 'approved'::boat_status AND b.is_active AND NOT b.is_deleted AND b.maintenance_status <> 'overdue'::text;
