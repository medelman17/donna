import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const positions = await prisma.jobPosition.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(positions);
}

export async function POST(request: NextRequest) {
  const { title, description } = await request.json();
  const position = await prisma.jobPosition.create({ data: { title: title ?? "", description: description ?? "" } });
  return NextResponse.json(position);
}

export async function PUT(request: NextRequest) {
  const { id, title, description } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const position = await prisma.jobPosition.update({ where: { id }, data: { title, description } });
  return NextResponse.json(position);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.jobPosition.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
