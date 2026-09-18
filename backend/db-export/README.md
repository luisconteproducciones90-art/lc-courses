# Base de datos LC-COURSES — lista para importar

Este dump contiene el esquema completo (`schema.sql`) más los 31 cursos reales,
7 categorías, sus temarios (254 ítems) y los 2 cupones activos, migrados desde
el sitio estático (`index.html`).

## Importar en un proveedor nuevo (Railway, Render, Supabase, etc.)

1. Creá una base PostgreSQL vacía en tu proveedor y copiá su `DATABASE_URL`.
2. Importá el dump:

   ```bash
   psql "$DATABASE_URL" -f lc_courses_full_dump.sql
   ```

Eso crea todas las tablas, índices, triggers y carga los datos en un solo paso.
No hace falta correr `schema.sql` ni `seed_courses.sql` por separado si usás
este dump.

## Alternativa: schema + seed por separado

Si preferís partir de una base ya existente con otra estructura, podés correr
en orden:

```bash
psql "$DATABASE_URL" -f ../src/migrations/schema.sql
psql "$DATABASE_URL" -f ../src/migrations/seed_courses.sql
```

## Nota sobre las imágenes

En `index.html` varias imágenes de cursos estaban incrustadas como base64
(300-500 KB cada una). Esas no se migraron a la base de datos: guardarlas en
la columna `thumbnail_url` como texto plano infla la tabla y no sirve como
URL servible. Los cursos que ya tenían una URL de imagen externa sí la
conservan; el resto quedó con `thumbnail_url = NULL`.

Recomendado: subir esas imágenes a Cloudflare R2 (el backend ya tiene
`src/services/r2.js` listo para esto) y actualizar `thumbnail_url` con la URL
pública resultante.
