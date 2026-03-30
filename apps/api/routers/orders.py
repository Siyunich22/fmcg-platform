from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
from pydantic import BaseModel
from decimal import Decimal
import uuid

from db import get_db
from models.models import Order, OrderItem, OrderStatus, OrderSource

router = APIRouter()


class OrderItemIn(BaseModel):
    nomenclature_id: str
    qty: float
    price: float


class OrderIn(BaseModel):
    branch_id: str
    comment: Optional[str] = None
    source: str = "manual"
    items: list[OrderItemIn]


@router.get("/")
async def list_orders(
    branch_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, le=100),
    db: AsyncSession = Depends(get_db),
):
    q = select(Order)
    if branch_id:
        q = q.where(Order.branch_id == branch_id)
    if status:
        q = q.where(Order.status == status)

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    q = q.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    orders = result.scalars().all()

    return {
        "data": [
            {
                "id": str(o.id),
                "number": o.number,
                "branch_id": str(o.branch_id),
                "branch_name": None,
                "status": o.status,
                "comment": o.comment,
                "total_amount": float(o.total_amount),
                "source": o.source,
                "created_at": o.created_at.isoformat(),
                "items": [],
            }
            for o in orders
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/")
async def create_order(order_in: OrderIn, db: AsyncSession = Depends(get_db)):
    total = sum(i.qty * i.price for i in order_in.items)

    count_result = await db.execute(select(func.count()).select_from(Order))
    count = count_result.scalar() or 0
    number = f"ORD-{count + 1:05d}"

    order = Order(
        number=number,
        branch_id=uuid.UUID(order_in.branch_id),
        status=OrderStatus.pending,
        comment=order_in.comment,
        total_amount=Decimal(str(total)),
        source=OrderSource(order_in.source),
    )
    db.add(order)
    await db.flush()

    for item in order_in.items:
        db.add(OrderItem(
            order_id=order.id,
            nomenclature_id=uuid.UUID(item.nomenclature_id),
            qty=Decimal(str(item.qty)),
            price=Decimal(str(item.price)),
            amount=Decimal(str(item.qty * item.price)),
        ))

    await db.commit()
    return {"id": str(order.id), "number": order.number, "status": order.status}


@router.patch("/{order_id}/status")
async def update_order_status(
    order_id: str,
    status: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Order).where(Order.id == uuid.UUID(order_id)))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Order not found")
    order.status = OrderStatus(status)
    await db.commit()
    return {"id": str(order.id), "status": order.status}
