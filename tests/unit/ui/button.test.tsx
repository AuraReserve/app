import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buttonVariants, Button } from "@/components/ui/button";

describe("Button component", () => {
  it("applies default variant styles", () => {
    render(<Button>Click me</Button>);

    const button = screen.getByRole("button", { name: "Click me" });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain(buttonVariants({ variant: "default", size: "default" }));
  });

  it("supports destructive variant", () => {
    render(
      <Button variant="destructive">
        Delete
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Delete" });
    expect(button.className).toContain(buttonVariants({ variant: "destructive" }));
  });
});
