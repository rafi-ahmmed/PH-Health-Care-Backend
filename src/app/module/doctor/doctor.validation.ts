
import { z } from "zod";

export const applyForDoctorValidationSchema = z.object({
	user: z.object({
		name: z.string().min(1, "Name is required"),
		email: z.string().email("Please provide a valid email"),
		password: z.string().min(8, "Password must be at least 8 characters"),
	}),

	doctor: z.object({
		address: z.string().optional(),
		specialization: z.string().min(1, "Specialization is required"),
		licenseNumber: z.string().min(1, "License number is required"),
		qualifications: z.string().min(1, "Qualifications are required"),
		experienceYears: z
			.number()
			.int("Experience years must be an integer")
			.min(0, "Experience years cannot be negative"),

		bio: z.string().optional(),

		consultationFee: z
			.number()
			.positive("Consultation fee must be positive")
			.optional(),

		contactNumber: z.string().optional(),
	}),
});

export type TApplyForDoctor = z.infer<typeof applyForDoctorValidationSchema>;