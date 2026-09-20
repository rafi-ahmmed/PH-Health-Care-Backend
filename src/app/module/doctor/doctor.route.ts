import { Router } from "express";
import { Role } from "../../../generated/prisma/browser";
import { upload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { doctorControllers } from "./doctor.controller";

const router = Router();

router.post(
	"/apply-as-doctor",
	upload.fields([
		{
			name: "resume",
			maxCount: 1,
		},
		{
			name: "additionalFiles",
			maxCount: 10,
		},
	]),
	doctorControllers.applyForDoctor,
);

export const doctorRoutes = router;
