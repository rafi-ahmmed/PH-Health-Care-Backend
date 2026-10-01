import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
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

router.post(
	"/apply-as-doctor/verify-email",
	doctorControllers.verifyDoctorEmail,
);

router.post(
	"/approve-doctor",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	doctorControllers.approveDoctor,
);

router.get(
	"/all-doctors",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	doctorControllers.getAllDoctors,
);

// router.post(
// 	"/verify-doctor-email",
// 	doctorControllers.verifyDoctorEmail,
// );

export const doctorRoutes = router;
