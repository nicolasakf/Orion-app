"use client"

import { useMemo, useState } from "react"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

interface ChartRendererProps {
  data: {
    headers: string[]
    rows: Record<string, string>[]
  }
  type: "bar" | "line" | "pie"
}

// Generate a color palette
const COLORS = [
  "#8884d8",
  "#83a6ed",
  "#8dd1e1",
  "#82ca9d",
  "#a4de6c",
  "#d0ed57",
  "#ffc658",
  "#ff8042",
  "#ff6361",
  "#bc5090",
]

export function ChartRenderer({ data, type }: ChartRendererProps) {
  // Make sure we have valid default values for x and y axes
  const defaultXAxis = data.headers.length > 0 ? data.headers[0] : "column"
  const defaultYAxis = data.headers.length > 1 ? data.headers[1] : data.headers.length > 0 ? data.headers[0] : "value"

  const [xAxis, setXAxis] = useState<string>(defaultXAxis)
  const [yAxis, setYAxis] = useState<string>(defaultYAxis)

  // Prepare data for charts
  const chartData = useMemo(() => {
    return data.rows.map((row) => {
      // Try to convert y-axis value to number
      const yValue = Number.parseFloat(String(row[yAxis]).replace(/[^0-9.-]+/g, ""))

      return {
        name: row[xAxis] || "N/A", // Ensure we never have empty values
        value: isNaN(yValue) ? 0 : yValue,
        [yAxis]: isNaN(yValue) ? 0 : yValue,
      }
    })
  }, [data.rows, xAxis, yAxis])

  // Get numeric columns for y-axis options
  const numericColumns = useMemo(() => {
    const columns = data.headers.filter((header) => {
      // Check if at least 50% of the values in this column are numeric
      const numericCount = data.rows.reduce((count, row) => {
        const value = Number.parseFloat(String(row[header]).replace(/[^0-9.-]+/g, ""))
        return isNaN(value) ? count : count + 1
      }, 0)

      return numericCount >= data.rows.length * 0.5
    })

    // If no numeric columns found, return all columns
    return columns.length > 0 ? columns : data.headers
  }, [data.headers, data.rows])

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>{type === "bar" ? "Bar Chart" : type === "line" ? "Line Chart" : "Pie Chart"}</CardTitle>
            <CardDescription>Visualization of table data</CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="x-axis">X-Axis</Label>
              <Select value={xAxis} onValueChange={setXAxis}>
                <SelectTrigger id="x-axis" className="w-[180px]">
                  <SelectValue placeholder="Select X-Axis" />
                </SelectTrigger>
                <SelectContent>
                  {data.headers.map((header) => (
                    <SelectItem key={header} value={header || "column"}>
                      {header || "Column"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="y-axis">Y-Axis</Label>
              <Select value={yAxis} onValueChange={setYAxis}>
                <SelectTrigger id="y-axis" className="w-[180px]">
                  <SelectValue placeholder="Select Y-Axis" />
                </SelectTrigger>
                <SelectContent>
                  {numericColumns.map((header) => (
                    <SelectItem key={header} value={header || "value"}>
                      {header || "Value"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="h-[400px]">
          {type === "bar" && (
            <ChartContainer
              config={{
                [yAxis]: {
                  label: yAxis,
                  color: "hsl(var(--chart-1))",
                },
              }}
              className="h-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Bar dataKey={yAxis} fill="var(--color-yAxis)" name={yAxis} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}

          {type === "line" && (
            <ChartContainer
              config={{
                [yAxis]: {
                  label: yAxis,
                  color: "hsl(var(--chart-1))",
                },
              }}
              className="h-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Line type="monotone" dataKey={yAxis} stroke="var(--color-yAxis)" name={yAxis} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}

          {type === "pie" && (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={150}
                  fill="#8884d8"
                  dataKey="value"
                  nameKey="name"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value}`, yAxis]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

