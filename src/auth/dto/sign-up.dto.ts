import { IsEmail, IsString, MinLength } from 'class-validator';

export class SignUpDto {
  @IsEmail()
  email: string;

  @IsString()
  full_name: string;

  @IsString()
  @MinLength(6)
  password: string;
}
