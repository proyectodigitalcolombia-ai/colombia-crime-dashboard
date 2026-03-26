import { Router, type IRouter } from "express";
import { db, blockadeTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

const VALID_CAUSES = ["comunidad","protesta_social","paro_camionero","grupos_ilegales","otro"] as const;
const VALID_STATUS = ["activo","levantado","intermitente"] as const;
type BlockadeCause = typeof VALID_CAUSES[number];
type BlockadeStatus = typeof VALID_STATUS[number];

function validateBody(body: any): { data: any; error?: string } {
  if (!body.corridorId?.trim()) return { data: null, error: "corridorId es requerido" };
  if (!body.department?.trim()) return { data: null, error: "department es requerido" };
  if (!body.date?.trim()) return { data: null, error: "date es requerida" };
  if (!body.location?.trim()) return { data: null, error: "location es requerido" };
  if (body.cause && !VALID_CAUSES.includes(body.cause)) return { data: null, error: "cause inválido" };
  if (body.status && !VALID_STATUS.includes(body.status)) return { data: null, error: "status inválido" };
  return { data: body };
}

/* GET /api/blockades?corridorId=bog-med */
router.get("/blockades", async (req, res) => {
  try {
    const { corridorId } = req.query as { corridorId?: string };
    const rows = corridorId
      ? await db.select().from(blockadeTable).where(eq(blockadeTable.corridorId, corridorId)).orderBy(desc(blockadeTable.createdAt))
      : await db.select().from(blockadeTable).orderBy(desc(blockadeTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("GET /api/blockades error:", err);
    res.status(500).json({ error: "Error fetching blockades" });
  }
});

/* POST /api/blockades */
router.post("/blockades", async (req, res) => {
  try {
    const { data, error } = validateBody(req.body);
    if (error) return res.status(400).json({ error });
    const [inserted] = await db.insert(blockadeTable).values({
      corridorId:    data.corridorId,
      department:    data.department,
      date:          data.date,
      cause:         (data.cause ?? "comunidad") as BlockadeCause,
      location:      data.location,
      durationHours: data.durationHours ?? null,
      status:        (data.status ?? "activo") as BlockadeStatus,
      notes:         data.notes ?? null,
      reporter:      data.reporter ?? null,
    }).returning();
    res.status(201).json(inserted);
  } catch (err) {
    console.error("POST /api/blockades error:", err);
    res.status(500).json({ error: "Error creating blockade" });
  }
});

/* PATCH /api/blockades/:id/status */
router.patch("/blockades/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const status = req.body?.status;
    if (!status || !VALID_STATUS.includes(status)) return res.status(400).json({ error: "Invalid status" });
    const [updated] = await db
      .update(blockadeTable)
      .set({ status: status as BlockadeStatus, updatedAt: new Date() })
      .where(eq(blockadeTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Blockade not found" });
    res.json(updated);
  } catch (err) {
    console.error("PATCH /api/blockades/:id/status error:", err);
    res.status(500).json({ error: "Error updating blockade" });
  }
});

/* DELETE /api/blockades/:id */
router.delete("/blockades/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [deleted] = await db
      .delete(blockadeTable)
      .where(eq(blockadeTable.id, id))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Blockade not found" });
    res.json({ success: true, id: deleted.id });
  } catch (err) {
    console.error("DELETE /api/blockades/:id error:", err);
    res.status(500).json({ error: "Error deleting blockade" });
  }
});

export default router;
