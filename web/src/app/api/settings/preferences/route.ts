import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const prefs = await prisma.hiringPreference.findMany({ orderBy: { weight: "desc" } });
  return NextResponse.json(prefs);
}

export async function POST(request: NextRequest) {
  const { tag, description, weight } = await request.json();
  const pref = await prisma.hiringPreference.create({ data: { tag: tag ?? "", description: description ?? "", weight: weight ?? 1 } });
  return NextResponse.json(pref);
}

export async function PUT(request: NextRequest) {
  const { id, tag, description, weight } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const pref = await prisma.hiringPreference.update({ where: { id }, data: { tag, description, weight } });
  return NextResponse.json(pref);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.hiringPreference.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
