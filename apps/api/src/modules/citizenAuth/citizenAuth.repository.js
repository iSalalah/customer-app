import prisma from '../../infra/prisma.js';

/** Sole Prisma consumer for citizen authentication. */

export function findCitizenByPhone(phoneNumber) {
  return prisma.citizen.findUnique({
    where: { phoneNumber },
    select: { id: true, phoneNumber: true, fullName: true },
  });
}

export function createCitizen(phoneNumber) {
  return prisma.citizen.create({
    data: { phoneNumber },
    select: { id: true, phoneNumber: true, fullName: true },
  });
}

/**
 * Creates a challenge and invalidates every earlier live one for the same
 * number in a single transaction, so there is never a window in which two codes
 * are simultaneously valid.
 */
export function createOtpChallenge({
  phoneNumber,
  codeHash,
  expiresAt,
  resendAvailableAt,
  maxAttempts,
  ipAddress,
}) {
  return prisma.$transaction(async (tx) => {
    await tx.otpChallenge.updateMany({
      where: { phoneNumber, consumedAt: null, invalidatedAt: null },
      data: { invalidatedAt: new Date() },
    });

    return tx.otpChallenge.create({
      data: {
        phoneNumber,
        codeHash,
        expiresAt,
        resendAvailableAt,
        maxAttempts,
        ipAddress: ipAddress ? String(ipAddress).slice(0, 64) : null,
      },
      select: { id: true, expiresAt: true, resendAvailableAt: true, createdAt: true },
    });
  });
}

export function findActiveChallenge(phoneNumber) {
  return prisma.otpChallenge.findFirst({
    where: { phoneNumber, consumedAt: null, invalidatedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

export function incrementAttempt(challengeId) {
  return prisma.otpChallenge.update({
    where: { id: challengeId },
    data: { attemptCount: { increment: 1 } },
    select: { attemptCount: true, maxAttempts: true },
  });
}

export function invalidateChallenge(challengeId) {
  return prisma.otpChallenge.update({
    where: { id: challengeId },
    data: { invalidatedAt: new Date() },
    select: { id: true },
  });
}

export function consumeChallenge(challengeId) {
  return prisma.otpChallenge.update({
    where: { id: challengeId },
    data: { consumedAt: new Date() },
    select: { id: true },
  });
}

/**
 * Deletes spent challenges. Expired rows carry a peppered hash of a dead code,
 * so retention buys nothing and deletion shrinks the blast radius of a dump.
 */
export async function purgeExpiredOtpChallenges(now = new Date()) {
  const result = await prisma.otpChallenge.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: new Date(now.getTime() - 60 * 60 * 1000) } },
        { consumedAt: { lte: new Date(now.getTime() - 60 * 60 * 1000) } },
      ],
    },
  });
  return result.count;
}
