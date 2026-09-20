import bcrypt from "bcryptjs";
import { Role } from "../../generated/prisma/enums";
import config from "../config";
import { prisma } from "../lib/prisma";

export const seedSuperAdmin = async () => {
	try {
		const isSuperAdminExist = await prisma.user.findFirst({
			where: {
				role: Role.SUPER_ADMIN,
			},
		});

		if (isSuperAdminExist) {
			console.log("SuperAdmin is already exist");
			return;
		}

		const name = config.super_admin_name as string;
		const email = config.super_admin_email as string;
		const password = config.super_admin_password;

		if (!name || !email || !password) {
			throw new Error("Super admin name email password is missing in env file");
		}

		const hashPassword = await bcrypt.hash(
			password as string,
			Number(config.bcrypt_salt_rounds),
		);

		const superAdmin = await prisma.user.create({
			data: {
				name,
				email,
				password: hashPassword,
				role: Role.SUPER_ADMIN,
				needPasswordChange: false,
				emailVerified: true,
			},
		});

		console.log("Super Admin Created: ", superAdmin);
	} catch (error) {
		console.log("Error seeding super admin", error);

		await prisma.user.delete({
			where: {
				email: config.super_admin_email,
			},
		});
	}
};

export const seedAdmin = async () => {
	try {
		const isAdminExist = await prisma.user.findFirst({
			where: {
				role: Role.ADMIN,
			},
		});

		if (isAdminExist) {
			console.log("Admin is already exist");
			return;
		}

		const name = config.admin_name as string;
		const email = config.admin_email as string;
		const password = config.admin_password;

		if (!name || !email || !password) {
			throw new Error("Admin name email password is missing in env file");
		}

		const hashPassword = await bcrypt.hash(
			password as string,
			Number(config.bcrypt_salt_rounds),
		);

		const admin = await prisma.user.create({
			data: {
				name,
				email,
				password: hashPassword,
				role: Role.ADMIN,
				needPasswordChange: false,
				emailVerified: true,
			},
		});

		console.log("Admin Created: ", admin);
	} catch (error) {
		console.log("Error seeding admin", error);

		await prisma.user.delete({
			where: {
				email: config.admin_email,
			},
		});
	}
};

export const seedDoctor = async () => {
	try {
		const isDoctorExist = await prisma.user.findFirst({
			where: {
				role: Role.DOCTOR,
			},
		});

		if (isDoctorExist) {
			console.log("Doctor is exist");
			return;
		}

		const name = config.doctor_name as string;
		const email = config.doctor_email as string;
		const password = config.doctor_password;

		if (!name || !email || !password) {
			throw new Error("Doctor's name email password is missing in env file");
		}

		const hashPassword = await bcrypt.hash(
			password as string,
			Number(config.bcrypt_salt_rounds),
		);

		const doctor = await prisma.user.create({
			data: {
				name,
				email,
				password: hashPassword,
				role: Role.DOCTOR,
				needPasswordChange: false,
				emailVerified: true,
				doctor: {
					create: {
						name,
						email,
						experienceYears: 5,
						licenseNumber: "TestNumber=fggh4f5h4g5h4g545gh",
						qualifications: "MBBS",
						specialization: "Heart specialist",
					},
				},
			},
		});

		console.log("Doctor is Created: ", doctor);
	} catch (error) {
		console.log("Error seeding doctor", error);

		await prisma.user.delete({
			where: {
				email: config.doctor_email,
			},
		});
	}
};
