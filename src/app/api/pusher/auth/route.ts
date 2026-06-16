import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { authorizeBoardChannel } from "@/lib/pusher-server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const body = await req.formData();
  const socketId = String(body.get("socket_id") ?? "");
  const channel = String(body.get("channel_name") ?? "");
  if (!socketId || !channel) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const match = channel.match(/^private-board-(.+)$/);
  if (match) {
    const boardId = match[1];
    const board = await db.board.findUnique({
      where: { id: boardId },
      select: { workspaceId: true },
    });
    if (!board) return new NextResponse("Not found", { status: 404 });
    const member = await db.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: session.user.id,
          workspaceId: board.workspaceId,
        },
      },
    });
    if (!member) return new NextResponse("Forbidden", { status: 403 });
    const authData = authorizeBoardChannel(socketId, channel, {
      id: session.user.id,
      name: session.user.name,
      image: session.user.image,
    });
    if (!authData) {
      return new NextResponse("Pusher not configured", { status: 503 });
    }
    return NextResponse.json(authData);
  }

  return new NextResponse("Channel not allowed", { status: 403 });
}
