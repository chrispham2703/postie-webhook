const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { hash, verify } = require('../utils/password');

function slugify(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Signup creates the Organization and its first User together — this is the
// one place in the whole app where an Organization gets created by an actual
// person instead of a seed script. The first user is always 'owner': someone
// has to be able to invite/manage others later.
async function signup({ orgName, email, password }) {
    const passwordHash = await hash(password);

    return prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
            data: {
                id: `org_${crypto.randomUUID()}`,
                name: orgName,
                slug: `${slugify(orgName)}-${crypto.randomUUID().slice(0, 8)}`,
            },
        });

        const user = await tx.user.create({
            data: {
                id: `user_${crypto.randomUUID()}`,
                email,
                passwordHash,
                name: email.split('@')[0],
                role: 'owner',
                orgId: org.id,
            },
        });

        return { org, user };
    });
}

async function login({ email, password }) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    const valid = await verify(password, user.passwordHash);
    return valid ? user : null;
}

module.exports = { signup, login };
