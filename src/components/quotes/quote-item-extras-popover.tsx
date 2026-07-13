import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatCurrency } from "@/lib/format";

export type QuoteItemExtra = {
  description: string;
  price: number;
};

type QuoteItemExtrasPopoverProps = {
  extras: QuoteItemExtra[];
  onChange: (extras: QuoteItemExtra[]) => void;
};

export function QuoteItemExtrasPopover({
  extras,
  onChange,
}: QuoteItemExtrasPopoverProps) {
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");

  const handleAdd = () => {
    if (!(description && price)) {
      return;
    }
    const numPrice = Number.parseFloat(price);
    if (Number.isNaN(numPrice) || numPrice <= 0) {
      return;
    }

    onChange([...extras, { description, price: numPrice }]);
    setDescription("");
    setPrice("");
  };

  const handleRemove = (index: number) => {
    onChange(extras.filter((_, i) => i !== index));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="h-8" size="sm" variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Extras ({extras.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Extras de la prenda</h4>
            <p className="text-muted-foreground text-sm">
              Agregue bordados, reflectivos u otros extras.
            </p>
          </div>
          <div className="grid gap-2">
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="desc">Descripción</Label>
              <Input
                className="col-span-2 h-8"
                id="desc"
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej. Bordado Logo"
                value={description}
              />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="price">Precio Un.</Label>
              <Input
                className="col-span-2 h-8"
                id="price"
                min="0"
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                step="0.01"
                type="number"
                value={price}
              />
            </div>
            <Button className="w-full" onClick={handleAdd} size="sm">
              Agregar Extra
            </Button>
          </div>
          {extras.length > 0 && (
            <div className="space-y-2 pt-2">
              <h4 className="font-medium text-sm">Extras agregados</h4>
              <ul className="space-y-2">
                {extras.map((extra, index) => (
                  <li
                    className="flex items-center justify-between text-sm"
                    key={`${extra.description}-${index}`}
                  >
                    <span>{extra.description}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {formatCurrency(extra.price)}
                      </span>
                      <Button
                        className="h-6 w-6 text-destructive"
                        onClick={() => handleRemove(index)}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
