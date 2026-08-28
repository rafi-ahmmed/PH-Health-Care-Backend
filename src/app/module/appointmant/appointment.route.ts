import { Router } from "express";
import { appointmentControllers } from "./appointment.controller";

const router = Router();

router.post("/book-appointment", appointmentControllers.bookAppointment);

// * Book appointment callback url
router.get(
	"/book-appointment/payment/callback",
	appointmentControllers.bookAppointmentCallback,
);

export const appointmentRoutes = router;
