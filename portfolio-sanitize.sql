-- ============================================================
-- portfolio-sanitize.sql
--
-- Purpose:
-- Replace personally identifiable information (PII)
-- in the members table while preserving relationships
-- required for demonstration purposes.
--
-- Intended for the public portfolio version of
-- golf-league-manager.
-- ============================================================

UPDATE members
SET
    name_first = 'Jack',
    name_last = 'Thompson',
    sex = 'M',
    phone = '555-0103',
    e_mail = 'jack.thompson@example.com',
    password = NULL
WHERE id = 3;

UPDATE members
SET
    name_first = 'Liam',
    name_last = 'Bennett',
    sex = 'M',
    phone = '555-0107',
    e_mail = 'liam.bennett@example.com',
    password = NULL
WHERE id = 7;

UPDATE members
SET
    name_first = 'Ethan',
    name_last = 'Foster',
    sex = 'M',
    phone = '555-0108',
    e_mail = 'ethan.foster@example.com',
    password = NULL
WHERE id = 8;

UPDATE members
SET
    name_first = 'Emma',
    name_last = 'Parker',
    sex = 'F',
    phone = '555-0109',
    e_mail = 'emma.parker@example.com',
    password = NULL
WHERE id = 9;

UPDATE members
SET
    name_first = 'Noah',
    name_last = 'Reed',
    sex = 'M',
    phone = '555-0110',
    e_mail = 'noah.reed@example.com',
    password = NULL
WHERE id = 10;

UPDATE members
SET
    name_first = 'Mason',
    name_last = 'Brooks',
    sex = 'M',
    phone = '555-0111',
    e_mail = 'mason.brooks@example.com',
    password = NULL
WHERE id = 11;

UPDATE members
SET
    name_first = 'Caleb',
    name_last = 'Collins',
    sex = 'M',
    phone = '555-0112',
    e_mail = 'caleb.collins@example.com',
    password = NULL
WHERE id = 12;

UPDATE members
SET
    name_first = 'Owen',
    name_last = 'Hayes',
    sex = 'M',
    phone = '555-0113',
    e_mail = 'owen.hayes@example.com',
    password = NULL
WHERE id = 13;

UPDATE members
SET
    name_first = 'Lucas',
    name_last = 'Sullivan',
    sex = 'M',
    phone = '555-0114',
    e_mail = 'lucas.sullivan@example.com',
    password = NULL
WHERE id = 14;

UPDATE members
SET
    name_first = 'Henry',
    name_last = 'Turner',
    sex = 'M',
    phone = '555-0115',
    e_mail = 'henry.turner@example.com',
    password = NULL
WHERE id = 15;

UPDATE members
SET
    name_first = 'Wyatt',
    name_last = 'Mitchell',
    sex = 'M',
    phone = '555-0116',
    e_mail = 'wyatt.mitchell@example.com',
    password = NULL
WHERE id = 16;

UPDATE members
SET
    name_first = 'Levi',
    name_last = 'Morgan',
    sex = 'M',
    phone = '555-0117',
    e_mail = 'levi.morgan@example.com',
    password = NULL
WHERE id = 17;

UPDATE members
SET
    name_first = 'Eli',
    name_last = 'Cooper',
    sex = 'M',
    phone = '555-0118',
    e_mail = 'eli.cooper@example.com',
    password = NULL
WHERE id = 18;

UPDATE members
SET
    name_first = 'Isaac',
    name_last = 'Bailey',
    sex = 'M',
    phone = '555-0119',
    e_mail = 'isaac.bailey@example.com',
    password = NULL
WHERE id = 19;

UPDATE members
SET
    name_first = 'Nolan',
    name_last = 'Richardson',
    sex = 'M',
    phone = '555-0120',
    e_mail = 'nolan.richardson@example.com',
    password = NULL
WHERE id = 20;

UPDATE members
SET
    name_first = 'Gavin',
    name_last = 'Ward',
    sex = 'M',
    phone = '555-0121',
    e_mail = 'gavin.ward@example.com',
    password = NULL
WHERE id = 21;

UPDATE members
SET
    name_first = 'Olivia',
    name_last = 'Carter',
    sex = 'F',
    phone = '555-0122',
    e_mail = 'olivia.carter@example.com',
    password = NULL
WHERE id = 22;

UPDATE members
SET
    name_first = 'Carter',
    name_last = 'Price',
    sex = 'M',
    phone = '555-0123',
    e_mail = 'carter.price@example.com',
    password = NULL
WHERE id = 23;

UPDATE members
SET
    name_first = 'Logan',
    name_last = 'Hughes',
    sex = 'M',
    phone = '555-0124',
    e_mail = 'logan.hughes@example.com',
    password = NULL
WHERE id = 24;

UPDATE members
SET
    name_first = 'Dylan',
    name_last = 'Perry',
    sex = 'M',
    phone = '555-0125',
    e_mail = 'dylan.perry@example.com',
    password = NULL
WHERE id = 25;

VACUUM;
