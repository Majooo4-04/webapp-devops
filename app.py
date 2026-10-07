import os
import sqlite3
from datetime import datetime
from flask import Flask, request, jsonify, g

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "data", "app.db"))
BACKUP_DIR = os.environ.get("BACKUP_DIR", os.path.join(os.path.dirname(DB_PATH), "backups"))


# ---------- Utilidades ----------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    os.makedirs(BACKUP_DIR, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        with open(os.path.join(BASE_DIR, "schema.sql"), encoding="utf-8") as f:
            conn.executescript(f.read())


def ok(data, status=200):
    return jsonify({"statusCode": status, "data": data}), status


def fail(message, status=400):
    return jsonify({"statusCode": status, "data": [], "message": message}), status


def rows(cursor):
    return [dict(r) for r in cursor.fetchall()]


# ---------- Raíz (para verificar en el navegador) ----------
@app.get("/")
def index():
    return ok([{"mensaje": "WebApp API funcionando", "version": "1.0"}])


# ---------- 1-2. Categorias ----------
@app.get("/api/categorias")
def listar_categorias():
    return ok(rows(get_db().execute("SELECT * FROM categorias ORDER BY id")))


@app.post("/api/categorias")
def crear_categoria():
    body = request.get_json(silent=True) or {}
    nombre = (body.get("nombre") or "").strip()
    if not nombre:
        return fail("El campo 'nombre' es obligatorio")
    db = get_db()
    try:
        cur = db.execute("INSERT INTO categorias (nombre) VALUES (?)", (nombre,))
        db.commit()
    except sqlite3.IntegrityError:
        return fail("La categoría ya existe", 409)
    return ok([{"id": cur.lastrowid, "nombre": nombre}], 201)


# ---------- 3-5. Productos ----------
@app.get("/api/productos")
def listar_productos():
    cur = get_db().execute(
        """SELECT p.id, p.nombre, p.precio, p.stock,
                  c.id AS categoria_id, c.nombre AS categoria
           FROM productos p JOIN categorias c ON c.id = p.categoria_id
           ORDER BY p.id"""
    )
    return ok(rows(cur))


@app.post("/api/productos")
def crear_producto():
    b = request.get_json(silent=True) or {}
    nombre = (b.get("nombre") or "").strip()
    try:
        precio = float(b.get("precio"))
        stock = int(b.get("stock", 0))
        categoria_id = int(b.get("categoria_id"))
    except (TypeError, ValueError):
        return fail("Campos requeridos: nombre, precio, categoria_id (stock opcional)")
    if not nombre:
        return fail("El campo 'nombre' es obligatorio")
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO productos (nombre, precio, stock, categoria_id) VALUES (?,?,?,?)",
            (nombre, precio, stock, categoria_id),
        )
        db.commit()
    except sqlite3.IntegrityError as e:
        return fail(f"Datos inválidos: {e}", 400)
    return ok([{"id": cur.lastrowid, "nombre": nombre, "precio": precio,
                "stock": stock, "categoria_id": categoria_id}], 201)


@app.delete("/api/productos/<int:pid>")
def eliminar_producto(pid):
    db = get_db()
    try:
        cur = db.execute("DELETE FROM productos WHERE id = ?", (pid,))
        db.commit()
    except sqlite3.IntegrityError:
        return fail("No se puede eliminar: el producto tiene pedidos asociados", 409)
    if cur.rowcount == 0:
        return fail("Producto no encontrado", 404)
    return ok([{"id": pid, "eliminado": True}])


# ---------- 6-7. Clientes ----------
@app.get("/api/clientes")
def listar_clientes():
    return ok(rows(get_db().execute("SELECT * FROM clientes ORDER BY id")))


@app.post("/api/clientes")
def crear_cliente():
    b = request.get_json(silent=True) or {}
    nombre = (b.get("nombre") or "").strip()
    email = (b.get("email") or "").strip().lower()
    if not nombre or not email:
        return fail("Campos requeridos: nombre, email")
    db = get_db()
    try:
        cur = db.execute("INSERT INTO clientes (nombre, email) VALUES (?,?)", (nombre, email))
        db.commit()
    except sqlite3.IntegrityError:
        return fail("El email ya está registrado", 409)
    return ok([{"id": cur.lastrowid, "nombre": nombre, "email": email}], 201)


# ---------- 8-9. Pedidos ----------
@app.get("/api/pedidos")
def listar_pedidos():
    db = get_db()
    pedidos = rows(db.execute(
        """SELECT p.id, p.fecha, c.id AS cliente_id, c.nombre AS cliente
           FROM pedidos p JOIN clientes c ON c.id = p.cliente_id ORDER BY p.id"""))
    for ped in pedidos:
        items = rows(db.execute(
            """SELECT d.producto_id, pr.nombre AS producto, d.cantidad, d.precio_unitario,
                      d.cantidad * d.precio_unitario AS subtotal
               FROM detalle_pedidos d JOIN productos pr ON pr.id = d.producto_id
               WHERE d.pedido_id = ?""", (ped["id"],)))
        ped["items"] = items
        ped["total"] = sum(i["subtotal"] for i in items)
    return ok(pedidos)


@app.post("/api/pedidos")
def crear_pedido():
    b = request.get_json(silent=True) or {}
    cliente_id = b.get("cliente_id")
    items = b.get("items") or []
    if not cliente_id or not items:
        return fail("Campos requeridos: cliente_id, items[{producto_id, cantidad}]")
    db = get_db()
    try:
        if not db.execute("SELECT 1 FROM clientes WHERE id=?", (cliente_id,)).fetchone():
            return fail("Cliente no encontrado", 404)
        cur = db.execute("INSERT INTO pedidos (cliente_id) VALUES (?)", (cliente_id,))
        pedido_id = cur.lastrowid
        total = 0.0
        for it in items:
            prod = db.execute("SELECT precio, stock FROM productos WHERE id=?",
                              (it.get("producto_id"),)).fetchone()
            cant = int(it.get("cantidad", 0))
            if not prod:
                raise ValueError(f"Producto {it.get('producto_id')} no existe")
            if cant <= 0 or cant > prod["stock"]:
                raise ValueError(f"Cantidad inválida o stock insuficiente (producto {it['producto_id']})")
            db.execute("INSERT INTO detalle_pedidos (pedido_id, producto_id, cantidad, precio_unitario) "
                       "VALUES (?,?,?,?)", (pedido_id, it["producto_id"], cant, prod["precio"]))
            db.execute("UPDATE productos SET stock = stock - ? WHERE id = ?", (cant, it["producto_id"]))
            total += cant * prod["precio"]
        db.commit()
    except (ValueError, TypeError, KeyError) as e:
        db.rollback()
        return fail(str(e))
    return ok([{"id": pedido_id, "cliente_id": cliente_id, "total": total}], 201)


# ---------- 10. Backup ----------
@app.post("/api/backup")
def hacer_backup():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    nombre = f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    destino = os.path.join(BACKUP_DIR, nombre)
    src = get_db()
    dst = sqlite3.connect(destino)
    with dst:
        src.backup(dst)
    dst.close()
    return ok([{"archivo": nombre, "ruta": destino, "bytes": os.path.getsize(destino)}], 201)


# ---------- 11. Vaciar BD ----------
@app.delete("/api/vaciar")
def vaciar_bd():
    db = get_db()
    # Orden: hijos primero, luego padres (respeta llaves foráneas)
    for tabla in ["detalle_pedidos", "pedidos", "productos", "clientes", "categorias"]:
        db.execute(f"DELETE FROM {tabla}")
    db.execute("DELETE FROM sqlite_sequence")  # reinicia autoincrementales
    db.commit()
    return ok([{"mensaje": "Base de datos vaciada"}])


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=80)
