# Presupuesto Diario

MVP personal para controlar gastos diarios de forma simple.

La app permite configurar un presupuesto diario, semanal o mensual, registrar gastos rápidos, ver cuánto queda disponible hoy y simular compras antes de hacerlas.

## Cómo probar

Abre la carpeta con VS Code y sirve los archivos con Live Server, o usa cualquier servidor estático local.

Archivos principales:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.json`
- `service-worker.js`

Los datos se guardan localmente en el navegador con `localStorage`.

## Conectar con Supabase

La app está preparada para funcionar de dos formas:

- Sin Supabase: guarda datos localmente en el navegador.
- Con Supabase: usa login por email y sincroniza presupuesto/gastos en la nube.

Pasos:

1. Crea un proyecto en Supabase.
2. En el SQL Editor de Supabase, ejecuta `supabase-schema.sql`.
3. En `app.js`, completa:

```js
const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = "TU_ANON_KEY";
```

4. En Supabase Auth, agrega esta URL como redirect permitido:

```txt
https://migueiturra.github.io/presupuesto-diario/
```

5. Sube los cambios a GitHub. GitHub Pages publicará la nueva versión.

No uses la `service_role key` en esta app. La `anon key` sí puede estar en frontend siempre que Row Level Security esté activo.
