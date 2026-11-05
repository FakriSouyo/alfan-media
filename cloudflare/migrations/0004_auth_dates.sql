-- Better Auth's SQLite adapter persists dates as ISO strings.
UPDATE "user" SET "createdAt"=strftime('%Y-%m-%dT%H:%M:%fZ',"createdAt"/1000.0,'unixepoch') WHERE typeof("createdAt")='integer';
UPDATE "user" SET "updatedAt"=strftime('%Y-%m-%dT%H:%M:%fZ',"updatedAt"/1000.0,'unixepoch') WHERE typeof("updatedAt")='integer';
