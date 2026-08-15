import z from "zod";

const patientRegistrationZodScheme = z.object({
	name: z
		.string("Not a string")
		.min(3, "Name must be at least 3 characters")
		.max(10, "Name must be at most 10 characters"),
	email: z.email("Not a valid email"),
	password: z
		.string("Not a string")
		.min(6, "Password must be at least 6 characters")
		.regex(/[A-Z]/, "Password must contain at least one uppercase letter")
		.regex(/[a-z]/, "Password must contain at least one lowercase letter")
		.regex(/[0-9]/, "Password must contain at least one digit")
		.regex(
			/[^A-Za-z0-9]/,
			"Password must contain at least one special character",
		)
		.regex(/[a-z]/, "Password must contain at least one lowercase letter")
		.regex(/[0-9]/, "Password must contain at least one digit")
		.regex(
			/[^A-Za-z0-9]/,
			"Password must contain at least one special character",
		),
	patient: z
		.object({
			contactNumber: z
				.string("Not a string")
				.min(10, "Contact number must be at least 10 characters")
				.max(15, "Contact number must be at most 15 characters")
				.optional(),
		})
		.optional(),
});

const PatientLoginZodScheme = z.object({
	email: z.email("Not a valid email"),
	password: z
		.string("Not a string")
		.min(6, "Password must be at least 6 characters"),
});

export const PatientValidation = {
	patientRegistrationZodScheme,
	PatientLoginZodScheme,
};
