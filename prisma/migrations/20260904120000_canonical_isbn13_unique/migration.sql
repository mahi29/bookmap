-- Rewrite Book.isbn to compact ISBN-13 (978/979 + valid check digit), drop
-- anything that isn't a real ISBN, resolve collisions by keeping the oldest
-- row's value, then enforce uniqueness. Multiple NULLs remain allowed.

CREATE OR REPLACE FUNCTION canonicalize_isbn(raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned TEXT;
  body TEXT;
  sum INT;
  i INT;
  n INT;
  check_digit INT;
  expected INT;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;

  cleaned := upper(regexp_replace(raw, '[^0-9Xx]', '', 'g'));

  IF length(cleaned) = 13 AND cleaned ~ '^97[89][0-9]{10}$' THEN
    sum := 0;
    FOR i IN 1..12 LOOP
      n := CAST(substr(cleaned, i, 1) AS INT);
      sum := sum + CASE WHEN i % 2 = 1 THEN n ELSE n * 3 END;
    END LOOP;
    expected := (10 - (sum % 10)) % 10;
    IF expected = CAST(substr(cleaned, 13, 1) AS INT) THEN
      RETURN cleaned;
    END IF;
    RETURN NULL;
  END IF;

  IF length(cleaned) = 10 AND cleaned ~ '^[0-9]{9}[0-9X]$' THEN
    sum := 0;
    FOR i IN 1..9 LOOP
      n := CAST(substr(cleaned, i, 1) AS INT);
      sum := sum + n * (11 - i);
    END LOOP;
    n := CASE
      WHEN substr(cleaned, 10, 1) = 'X' THEN 10
      ELSE CAST(substr(cleaned, 10, 1) AS INT)
    END;
    sum := sum + n;
    IF sum % 11 <> 0 THEN
      RETURN NULL;
    END IF;

    body := '978' || substr(cleaned, 1, 9);
    sum := 0;
    FOR i IN 1..12 LOOP
      n := CAST(substr(body, i, 1) AS INT);
      sum := sum + CASE WHEN i % 2 = 1 THEN n ELSE n * 3 END;
    END LOOP;
    check_digit := (10 - (sum % 10)) % 10;
    RETURN body || check_digit::TEXT;
  END IF;

  RETURN NULL;
END;
$$;

UPDATE "Book" SET isbn = canonicalize_isbn(isbn);

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY isbn
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "Book"
  WHERE isbn IS NOT NULL
)
UPDATE "Book" AS b
SET isbn = NULL
FROM ranked AS r
WHERE b.id = r.id AND r.rn > 1;

DROP FUNCTION canonicalize_isbn(TEXT);

CREATE UNIQUE INDEX "Book_isbn_key" ON "Book"("isbn");
