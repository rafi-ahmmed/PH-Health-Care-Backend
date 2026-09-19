import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { appointmentControllers } from "./appointment.controller";

const router = Router();

router.post(
	"/book-appointment",
	auth(Role.PATIENT),
	appointmentControllers.bookAppointment,
);

router.post(
	"/payFor-appointment",
	auth(Role.PATIENT),
	appointmentControllers.payForAppointment,
);
router.post(
	"/cancel-appointment",
	auth(Role.PATIENT, Role.ADMIN, Role.DOCTOR, Role.SUPER_ADMIN),
	appointmentControllers.cancelAppointment,
);

// * Book appointment callback For bkash payment
router.get(
	"/book-appointment/payment/callback",
	appointmentControllers.bookAppointmentCallback,
);

export const appointmentRoutes = router;
