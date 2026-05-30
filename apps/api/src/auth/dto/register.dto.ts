import { IsArray, IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";

const ROLE_VALUES = ["customer", "picker", "driver", "merchant", "admin"] as const;

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsArray()
  @IsIn(ROLE_VALUES, { each: true })
  roles?: (typeof ROLE_VALUES)[number][];
}
