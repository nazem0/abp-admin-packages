using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AbpAdmin.Host.Migrations;

/// <inheritdoc />
public partial class _20261118130845_AddBookBestseller : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "Bestseller",
            table: "AppBooks",
            type: "bit",
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "Bestseller",
            table: "AppBooks");
    }
}
