"use client"; /** * Financial Tab * Administración de Saldos - Cash flow y obligaciones */
import { DollarSignIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/modules/dashboard/types";
import { KPICard } from "./kpi-card";
import { TopDebtorsDataTable } from "./top-debtors-data-table";

type FinancialTabProps = { data: DashboardData };
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}
export function FinancialTab({ data }: FinancialTabProps) {
  return (
    <div className="space-y-6">
      {" "}
      {/* Financial KPIs */}{" "}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {" "}
        <KPICard
          format="currency"
          icon={<DollarSignIcon />}
          percentageChange={data.financialKPIs.toCollect.percentageChange}
          subtitle="Cuentas por Cobrar"
          title="Saldo Total (Bancos + Caja)"
          value={data.accountsReceivable.total}
        />{" "}
        <KPICard
          format="currency"
          icon={<TrendingUpIcon />}
          percentageChange={data.financialKPIs.toCollect.percentageChange}
          subtitle="Promedio 25 días"
          title="Cuentas por Cobrar"
          value={data.financialKPIs.toCollect.amount}
        />{" "}
        <KPICard
          format="currency"
          icon={<TrendingDownIcon />}
          percentageChange={data.financialKPIs.toPay.percentageChange}
          subtitle="Vencen en 15 días"
          title="Cuentas por Pagar"
          value={data.financialKPIs.toPay.amount}
        />{" "}
        <KPICard
          icon={<TrendingUpIcon />}
          percentageChange={0}
          subtitle="Próxima semana"
          title="Flujo Proyectado"
          value="+$15,000"
        />{" "}
      </div>{" "}
      {/* Alerts for Due Dates */}{" "}
      {(data.accountsReceivable.overdue > 0 ||
        data.accountsPayable.next7Days > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {" "}
          {data.accountsReceivable.overdue > 0 && (
            <Card className="border-red-200 bg-red-50">
              {" "}
              <CardHeader>
                {" "}
                <CardTitle className="text-red-900 text-sm">
                  {" "}
                  Facturas Vencidas{" "}
                </CardTitle>{" "}
              </CardHeader>{" "}
              <CardContent>
                {" "}
                <p className="text-muted-foreground text-sm">
                  {" "}
                  3 facturas por{" "}
                  {formatCurrency(data.accountsReceivable.overdue)} están
                  vencidas. Contactar clientes inmediatamente.{" "}
                </p>{" "}
              </CardContent>{" "}
            </Card>
          )}{" "}
          {data.accountsPayable.next7Days > 0 && (
            <Card className="border-yellow-200 bg-yellow-50">
              {" "}
              <CardHeader>
                {" "}
                <CardTitle className="text-sm text-yellow-900">
                  {" "}
                  Vencen Esta Semana{" "}
                </CardTitle>{" "}
              </CardHeader>{" "}
              <CardContent>
                {" "}
                <p className="text-muted-foreground text-sm">
                  {" "}
                  5 facturas por{" "}
                  {formatCurrency(data.accountsPayable.next7Days)} vencen en los
                  próximos 7 días.{" "}
                </p>{" "}
              </CardContent>{" "}
            </Card>
          )}{" "}
        </div>
      )}{" "}
      {/* Aging Tables */}{" "}
      <div className="grid gap-4 md:grid-cols-2">
        {" "}
        <Card>
          {" "}
          <CardHeader>
            {" "}
            <CardTitle>Aging Cuentas por Cobrar</CardTitle>{" "}
            <p className="text-muted-foreground text-sm">
              {" "}
              Distribución por antigüedad{" "}
            </p>{" "}
          </CardHeader>{" "}
          <CardContent>
            {" "}
            <div className="space-y-3">
              {" "}
              <div className="flex items-center justify-between">
                {" "}
                <div className="flex items-center gap-2">
                  {" "}
                  <div className="h-3 w-3 rounded-full bg-green-600" />{" "}
                  <span className="text-sm">0-30 días</span>{" "}
                </div>{" "}
                <span className="font-semibold">
                  {" "}
                  {formatCurrency(25_000)}{" "}
                </span>{" "}
              </div>{" "}
              <div className="flex items-center justify-between">
                {" "}
                <div className="flex items-center gap-2">
                  {" "}
                  <div className="h-3 w-3 rounded-full bg-yellow-600" />{" "}
                  <span className="text-sm">31-60 días</span>{" "}
                </div>{" "}
                <span className="font-semibold">
                  {" "}
                  {formatCurrency(15_000)}{" "}
                </span>{" "}
              </div>{" "}
              <div className="flex items-center justify-between">
                {" "}
                <div className="flex items-center gap-2">
                  {" "}
                  <div className="h-3 w-3 rounded-full bg-orange-600" />{" "}
                  <span className="text-sm">61-90 días</span>{" "}
                </div>{" "}
                <span className="font-semibold">
                  {formatCurrency(8000)}
                </span>{" "}
              </div>{" "}
              <div className="flex items-center justify-between">
                {" "}
                <div className="flex items-center gap-2">
                  {" "}
                  <div className="h-3 w-3 rounded-full bg-red-600" />{" "}
                  <span className="text-sm">+90 días</span>{" "}
                </div>{" "}
                <span className="font-semibold">
                  {formatCurrency(3000)}
                </span>{" "}
              </div>{" "}
            </div>{" "}
          </CardContent>{" "}
        </Card>{" "}
        <Card>
          {" "}
          <CardHeader>
            {" "}
            <CardTitle>Aging Cuentas por Pagar</CardTitle>{" "}
            <p className="text-muted-foreground text-sm">
              {" "}
              Obligaciones por vencer{" "}
            </p>{" "}
          </CardHeader>{" "}
          <CardContent>
            {" "}
            <div className="space-y-3">
              {" "}
              <div className="flex items-center justify-between">
                {" "}
                <div className="flex items-center gap-2">
                  {" "}
                  <div className="h-3 w-3 rounded-full bg-green-600" />{" "}
                  <span className="text-sm">0-30 días</span>{" "}
                </div>{" "}
                <span className="font-semibold">
                  {" "}
                  {formatCurrency(12_000)}{" "}
                </span>{" "}
              </div>{" "}
              <div className="flex items-center justify-between">
                {" "}
                <div className="flex items-center gap-2">
                  {" "}
                  <div className="h-3 w-3 rounded-full bg-yellow-600" />{" "}
                  <span className="text-sm">31-60 días</span>{" "}
                </div>{" "}
                <span className="font-semibold">
                  {formatCurrency(6500)}
                </span>{" "}
              </div>{" "}
              <div className="flex items-center justify-between">
                {" "}
                <div className="flex items-center gap-2">
                  {" "}
                  <div className="h-3 w-3 rounded-full bg-orange-600" />{" "}
                  <span className="text-sm">61-90 días</span>{" "}
                </div>{" "}
                <span className="font-semibold">{formatCurrency(0)}</span>{" "}
              </div>{" "}
              <div className="flex items-center justify-between">
                {" "}
                <div className="flex items-center gap-2">
                  {" "}
                  <div className="h-3 w-3 rounded-full bg-red-600" />{" "}
                  <span className="text-sm">+90 días</span>{" "}
                </div>{" "}
                <span className="font-semibold">{formatCurrency(0)}</span>{" "}
              </div>{" "}
            </div>{" "}
          </CardContent>{" "}
        </Card>{" "}
      </div>{" "}
      {/* Customer Drop Detection */}{" "}
      {data.topDebtors.length > 0 && (
        <Card>
          {" "}
          <CardHeader>
            {" "}
            <CardTitle>Detección de Caídas en Clientes</CardTitle>{" "}
            <p className="text-muted-foreground text-sm">
              {" "}
              Clientes con reducción significativa en ticket o frecuencia{" "}
            </p>{" "}
          </CardHeader>{" "}
          <CardContent>
            {" "}
            <TopDebtorsDataTable debtors={data.topDebtors} />{" "}
          </CardContent>{" "}
        </Card>
      )}{" "}
    </div>
  );
}
